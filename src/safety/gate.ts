import type { AppConfig } from "./config.js";
import { AuditLog } from "./audit.js";
import { SafeError, refusalForDatabase, refusalForPage } from "./errors.js";
import { clampLimit, truncateText } from "./text.js";
import type {
  DatabaseInfo,
  DatabaseRow,
  DataSource,
  PageContent,
  SearchHit,
} from "../data/types.js";

/**
 * THE safety choke point.
 *
 * Every tool call goes through SafetyGate. Tools never touch a DataSource
 * directly. The gate enforces, in order:
 *   1. the allowlist (databases and pages),
 *   2. clamped limits,
 *   3. truncated results,
 *   4. an audit record for every decision.
 */
export class SafetyGate {
  constructor(
    private readonly source: DataSource,
    private readonly config: AppConfig,
    private readonly audit: AuditLog,
  ) {}

  private get allowedDatabases(): Set<string> {
    return new Set(this.config.allowedDatabaseIds);
  }

  private get allowedPages(): Set<string> {
    return new Set(this.config.allowedPageIds);
  }

  /** Allowlist check used by every database operation — and by the tests. */
  assertDatabaseAllowed(databaseId: string, tool = "query_database"): void {
    if (!this.allowedDatabases.has(databaseId)) {
      this.audit.record({
        ts: new Date().toISOString(),
        tool,
        decision: "deny",
        target: databaseId,
        detail: "database not on allowlist",
      });
      throw refusalForDatabase(databaseId);
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const all = await this.source.listDatabases();
    const allowed = all.filter((db) => this.allowedDatabases.has(db.id));
    this.audit.record({
      ts: new Date().toISOString(),
      tool: "list_databases",
      decision: "allow",
      detail: `${allowed.length} allowlisted database(s)`,
    });
    return allowed;
  }

  async queryDatabase(
    databaseId: string,
    filterText: string | undefined,
    pageSize: number | undefined,
  ): Promise<DatabaseRow[]> {
    this.assertDatabaseAllowed(databaseId);
    const size = clampLimit(pageSize);
    const rows = await this.source.queryDatabase(databaseId, filterText, size);
    this.audit.record({
      ts: new Date().toISOString(),
      tool: "query_database",
      decision: "allow",
      target: databaseId,
      detail: `${rows.length} row(s), pageSize<=${size}`,
    });
    return rows;
  }

  async getPage(pageId: string): Promise<PageContent> {
    const descriptor = await this.source.describePage(pageId);
    if (!descriptor.exists) {
      this.audit.record({
        ts: new Date().toISOString(),
        tool: "get_page",
        decision: "error",
        target: pageId,
        detail: "page not found",
      });
      throw new SafeError("NOT_FOUND", `No page found with id "${pageId}".`);
    }

    const allowed =
      this.allowedPages.has(pageId) ||
      (descriptor.databaseId !== undefined && this.allowedDatabases.has(descriptor.databaseId)) ||
      // In sample mode the bundled standalone pages are the demo corpus and are
      // allowlisted via config defaults; in notion mode standalone pages must
      // be listed explicitly in ALLOWED_PAGE_IDS.
      (descriptor.standalone && this.config.mode === "sample" && this.allowedPages.size === 0);

    if (!allowed) {
      this.audit.record({
        ts: new Date().toISOString(),
        tool: "get_page",
        decision: "deny",
        target: pageId,
        detail: "page not on allowlist",
      });
      throw refusalForPage(pageId);
    }

    const page = await this.source.getPage(pageId);
    if (!page) {
      throw new SafeError("NOT_FOUND", `No page found with id "${pageId}".`);
    }
    this.audit.record({
      ts: new Date().toISOString(),
      tool: "get_page",
      decision: "allow",
      target: pageId,
    });
    return { ...page, text: truncateText(page.text) };
  }

  async search(query: string, limit: number | undefined): Promise<SearchHit[]> {
    const capped = clampLimit(limit);
    // Over-fetch slightly because the allowlist filter may drop hits.
    const raw = await this.source.search(query, Math.min(capped * 3, 75));
    const hits = raw.filter((hit) => this.hitAllowed(hit)).slice(0, capped);
    this.audit.record({
      ts: new Date().toISOString(),
      tool: "search_notion",
      decision: "allow",
      detail: `${hits.length} allowlisted hit(s)`,
    });
    return hits;
  }

  private hitAllowed(hit: SearchHit): boolean {
    if (hit.kind === "database") return this.allowedDatabases.has(hit.id);
    if (hit.kind === "database-row") {
      return hit.databaseId !== undefined && this.allowedDatabases.has(hit.databaseId);
    }
    // Standalone page hit.
    if (this.allowedPages.has(hit.id)) return true;
    // Sample-mode demo corpus: sample pages are allowlisted by default config.
    return this.config.mode === "sample" && this.allowedPages.size === 0;
  }
}

import workspace from "./sample/workspace.json" with { type: "json" };
import type {
  DatabaseInfo,
  DatabaseRow,
  DataSource,
  PageContent,
  PageDescriptor,
  SearchHit,
} from "./types.js";
import type { SampleAllowlistDefaults } from "../safety/config.js";

interface SampleRow {
  id: string;
  properties: Record<string, string>;
}
interface SampleDatabase {
  id: string;
  title: string;
  titleProperty: string;
  allowlisted: boolean;
  properties: string[];
  rows: SampleRow[];
}
interface SamplePage {
  id: string;
  title: string;
  allowlisted: boolean;
  text: string;
}

const databases = workspace.databases as unknown as SampleDatabase[];
const pages = workspace.pages as unknown as SamplePage[];

/** The sample dataset's built-in allowlist (used when env doesn't override). */
export function sampleAllowlistDefaults(): SampleAllowlistDefaults {
  return {
    databaseIds: databases.filter((d) => d.allowlisted).map((d) => d.id),
    pageIds: pages.filter((p) => p.allowlisted).map((p) => p.id),
  };
}

/**
 * A realistic fake Notion workspace, loaded from JSON.
 * It deliberately contains a NON-allowlisted database (Salary Database) and a
 * planted prompt-injection page, so the safety layer and the eval suite have
 * something real to refuse / resist. This class makes no access decisions —
 * the SafetyGate does.
 */
export class SampleDataSource implements DataSource {
  async search(query: string, limit: number): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    const hits: SearchHit[] = [];

    for (const db of databases) {
      if (db.title.toLowerCase().includes(q)) {
        hits.push({
          id: db.id,
          kind: "database",
          title: db.title,
          snippet: `Database with ${db.rows.length} rows. Properties: ${db.properties.join(", ")}.`,
        });
      }
      for (const row of db.rows) {
        const title = row.properties[db.titleProperty] ?? row.id;
        const haystack = Object.values(row.properties).join(" ").toLowerCase();
        if (title.toLowerCase().includes(q) || haystack.includes(q)) {
          hits.push({
            id: row.id,
            kind: "database-row",
            title,
            databaseId: db.id,
            snippet: Object.entries(row.properties)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
              .slice(0, 240),
          });
        }
      }
    }

    for (const page of pages) {
      if (page.title.toLowerCase().includes(q) || page.text.toLowerCase().includes(q)) {
        const idx = page.text.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 60);
        hits.push({
          id: page.id,
          kind: "page",
          title: page.title,
          snippet: page.text.replace(/\s+/g, " ").slice(start, start + 240),
        });
      }
    }

    return hits.slice(0, limit);
  }

  async getPage(pageId: string): Promise<PageContent | null> {
    const page = pages.find((p) => p.id === pageId);
    if (page) return { id: page.id, title: page.title, text: page.text };

    for (const db of databases) {
      const row = db.rows.find((r) => r.id === pageId);
      if (row) {
        const title = row.properties[db.titleProperty] ?? row.id;
        const lines = Object.entries(row.properties).map(([k, v]) => `- **${k}:** ${v}`);
        return {
          id: row.id,
          title,
          databaseId: db.id,
          text: `# ${title}\n\nRow of database "${db.title}".\n\n${lines.join("\n")}`,
        };
      }
    }
    return null;
  }

  async describePage(pageId: string): Promise<PageDescriptor> {
    if (pages.some((p) => p.id === pageId)) return { exists: true, standalone: true };
    for (const db of databases) {
      if (db.rows.some((r) => r.id === pageId)) {
        return { exists: true, standalone: false, databaseId: db.id };
      }
    }
    return { exists: false, standalone: false };
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return databases.map((d) => ({ id: d.id, title: d.title, properties: [...d.properties] }));
  }

  async queryDatabase(
    databaseId: string,
    filterText: string | undefined,
    pageSize: number,
  ): Promise<DatabaseRow[]> {
    const db = databases.find((d) => d.id === databaseId);
    if (!db) return [];
    let rows = db.rows;
    if (filterText) {
      const f = filterText.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r.properties).join(" ").toLowerCase().includes(f),
      );
    }
    return rows.slice(0, pageSize).map((r) => ({
      id: r.id,
      title: r.properties[db.titleProperty] ?? r.id,
      properties: { ...r.properties },
    }));
  }
}

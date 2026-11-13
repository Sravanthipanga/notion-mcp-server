/**
 * Internal data shapes shared by every DataSource implementation.
 * The MCP server only ever sees these shapes — never raw Notion API objects.
 */

export interface DatabaseInfo {
  id: string;
  title: string;
  /** Human-readable property names, in display order. */
  properties: string[];
}

export interface DatabaseRow {
  /** The row's page id (rows in Notion are pages). */
  id: string;
  /** Value of the database's title property. */
  title: string;
  /** All properties flattened to display strings. */
  properties: Record<string, string>;
}

export interface PageContent {
  id: string;
  title: string;
  /** Set when the page is a row of a database. */
  databaseId?: string;
  /** Plain-text / markdown-ish rendering of the page body. */
  text: string;
}

export type SearchHitKind = "page" | "database" | "database-row";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  title: string;
  snippet: string;
  /** Set for database-row hits. */
  databaseId?: string;
}

/** Metadata the safety layer needs to make an allowlist decision about a page. */
export interface PageDescriptor {
  exists: boolean;
  /** Set when the page is a row of a database. */
  databaseId?: string;
  /** True for standalone pages (not database rows). */
  standalone: boolean;
}

/**
 * A source of Notion-shaped data. Implementations must NOT make their own
 * access-control decisions — every call is mediated by the safety layer,
 * which is the single choke point for allowlist enforcement.
 */
export interface DataSource {
  /** Search across everything the source can see. The safety layer filters results. */
  search(query: string, limit: number): Promise<SearchHit[]>;
  /** Full content of one page (or database row rendered as a page). Null when unknown. */
  getPage(pageId: string): Promise<PageContent | null>;
  /** Describe a page for an allowlist decision, without returning its content. */
  describePage(pageId: string): Promise<PageDescriptor>;
  /** Every database the source knows about (allowlisted or not). The safety layer filters. */
  listDatabases(): Promise<DatabaseInfo[]>;
  /** Rows of one database. Callers must check the allowlist BEFORE calling this. */
  queryDatabase(
    databaseId: string,
    filterText: string | undefined,
    pageSize: number,
  ): Promise<DatabaseRow[]>;
}

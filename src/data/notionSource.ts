import { Client } from "@notionhq/client";
import type {
  DatabaseInfo,
  DatabaseRow,
  DataSource,
  PageContent,
  PageDescriptor,
  SearchHit,
} from "./types.js";

/**
 * The minimal slice of the Notion API client this source uses.
 * Structural on purpose: unit tests inject a mock with this shape,
 * and the real @notionhq/client satisfies it.
 */
export interface NotionClientLike {
  search(params: { query: string; page_size: number }): Promise<any>;
  dataSources: {
    query(params: { data_source_id: string; page_size: number }): Promise<any>;
    retrieve(params: { data_source_id: string }): Promise<any>;
  };
  pages: {
    retrieve(params: { page_id: string }): Promise<any>;
  };
  blocks: {
    children: {
      list(params: { block_id: string; page_size: number }): Promise<any>;
    };
  };
}

function richTextToPlain(rich: any[] | undefined): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((r) => r?.plain_text ?? "").join("");
}

/** Flatten one Notion property object to a display string. */
export function flattenProperty(prop: any): string {
  if (!prop || typeof prop !== "object") return "";
  const value = prop[prop.type];
  switch (prop.type) {
    case "title":
    case "rich_text":
      return richTextToPlain(value);
    case "select":
    case "status":
      return value?.name ?? "";
    case "multi_select":
      return Array.isArray(value) ? value.map((v: any) => v?.name ?? "").filter(Boolean).join(", ") : "";
    case "url":
    case "email":
    case "phone_number":
      return typeof value === "string" ? value : "";
    case "number":
      return value === null || value === undefined ? "" : String(value);
    case "date":
      return value?.start ?? "";
    case "checkbox":
      return value ? "Yes" : "No";
    case "formula":
      return flattenFormula(value);
    default:
      return "";
  }
}

function flattenFormula(value: any): string {
  if (!value || typeof value !== "object") return "";
  const inner = value[value.type];
  return inner === null || inner === undefined ? "" : String(inner);
}

export function pageTitle(page: any): string {
  const props = page?.properties ?? {};
  for (const key of Object.keys(props)) {
    if (props[key]?.type === "title") {
      const t = flattenProperty(props[key]);
      if (t) return t;
    }
  }
  if (page?.child_page?.title) return page.child_page.title;
  return "Untitled";
}

export function flattenRow(page: any): DatabaseRow {
  const properties: Record<string, string> = {};
  const props = page?.properties ?? {};
  for (const [name, prop] of Object.entries(props)) {
    properties[name] = flattenProperty(prop);
  }
  return { id: page.id, title: pageTitle(page), properties };
}

/** Convert one Notion block to a line of plain text / markdown. Conservative subset. */
export function blockToText(block: any): string {
  const type: string = block?.type ?? "";
  const body = block?.[type];
  const text = richTextToPlain(body?.rich_text);
  switch (type) {
    case "paragraph":
      return text;
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `- [${body?.checked ? "x" : " "}] ${text}`;
    case "code":
      return "```" + (body?.language ?? "") + "\n" + text + "\n```";
    case "quote":
      return `> ${text}`;
    default:
      return text;
  }
}

function parentDatabaseId(page: any): string | undefined {
  const parent = page?.parent ?? {};
  return parent.database_id ?? parent.data_source_id ?? undefined;
}

/**
 * Real Notion data source, backed by @notionhq/client.
 * The token is passed in by the server bootstrap (from the environment) and
 * is never logged. Not exercised live without credentials — covered by unit
 * tests with a mocked client.
 */
export class NotionDataSource implements DataSource {
  private readonly client: NotionClientLike;

  constructor(token: string, client?: NotionClientLike) {
    this.client = client ?? (new Client({ auth: token }) as unknown as NotionClientLike);
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      // Deliberately vague: API error bodies can contain ids and details
      // that do not belong in tool results or logs.
      throw new Error("Notion API request failed");
    }
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const res = await this.guard(() =>
      this.client.search({ query, page_size: Math.min(limit, 100) }),
    );
    const hits: SearchHit[] = [];
    for (const item of res?.results ?? []) {
      if (item.object === "data_source" || item.object === "database") {
        hits.push({
          id: item.id,
          kind: "database",
          title: richTextToPlain(item.title) || "Untitled database",
          snippet: "Database",
        });
      } else if (item.object === "page") {
        const dbId = parentDatabaseId(item);
        hits.push({
          id: item.id,
          kind: dbId ? "database-row" : "page",
          title: pageTitle(item),
          databaseId: dbId,
          snippet: dbId ? "Row of an allowlisted database" : "Page",
        });
      }
    }
    return hits;
  }

  async describePage(pageId: string): Promise<PageDescriptor> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId });
      const dbId = parentDatabaseId(page);
      return { exists: true, standalone: !dbId, databaseId: dbId };
    } catch {
      return { exists: false, standalone: false };
    }
  }

  async getPage(pageId: string): Promise<PageContent | null> {
    const descriptor = await this.describePage(pageId);
    if (!descriptor.exists) return null;
    const page = await this.guard(() => this.client.pages.retrieve({ page_id: pageId }));
    const blocks = await this.guard(() =>
      this.client.blocks.children.list({ block_id: pageId, page_size: 100 }),
    );
    const lines = (blocks?.results ?? []).map(blockToText).filter((l: string) => l !== "");
    return {
      id: pageId,
      title: pageTitle(page),
      databaseId: descriptor.databaseId,
      text: lines.join("\n\n"),
    };
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const res = await this.guard(() => this.client.search({ query: "", page_size: 100 }));
    const out: DatabaseInfo[] = [];
    for (const item of res?.results ?? []) {
      if (item.object !== "data_source" && item.object !== "database") continue;
      let properties: string[] = [];
      try {
        const ds = await this.client.dataSources.retrieve({ data_source_id: item.id });
        properties = Object.keys(ds?.properties ?? {});
      } catch {
        properties = [];
      }
      out.push({
        id: item.id,
        title: richTextToPlain(item.title) || "Untitled database",
        properties,
      });
    }
    return out;
  }

  async queryDatabase(
    databaseId: string,
    filterText: string | undefined,
    pageSize: number,
  ): Promise<DatabaseRow[]> {
    const res = await this.guard(() =>
      this.client.dataSources.query({
        data_source_id: databaseId,
        page_size: Math.min(pageSize, 100),
      }),
    );
    let rows: DatabaseRow[] = (res?.results ?? [])
      .filter((p: any) => p.object === "page")
      .map(flattenRow);
    if (filterText) {
      const f = filterText.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r.properties).join(" ").toLowerCase().includes(f),
      );
    }
    return rows.slice(0, pageSize);
  }
}

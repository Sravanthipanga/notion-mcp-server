import { describe, expect, it } from "vitest";
import {
  NotionDataSource,
  blockToText,
  flattenProperty,
  type NotionClientLike,
} from "../src/data/notionSource.js";

const rowPage = {
  object: "page",
  id: "row-1",
  parent: { database_id: "db-1" },
  properties: {
    Name: { type: "title", title: [{ plain_text: "Notion MCP Server" }] },
    Status: { type: "status", status: { name: "Building" } },
    Stack: {
      type: "multi_select",
      multi_select: [{ name: "TypeScript" }, { name: "MCP SDK" }],
    },
    "Live URL": { type: "url", url: "https://example.com" },
    Score: { type: "number", number: 42 },
    "Built On": { type: "date", date: { start: "2026-11-13" } },
  },
};

const standalonePage = {
  object: "page",
  id: "page-1",
  parent: { type: "workspace", workspace: true },
  properties: {
    title: { type: "title", title: [{ plain_text: "Hello Page" }] },
  },
};

function mockClient(): NotionClientLike {
  return {
    search: async () => ({ results: [rowPage, standalonePage] }),
    dataSources: {
      query: async () => ({ results: [rowPage] }),
      retrieve: async () => ({ properties: { Name: {}, Status: {}, Stack: {} } }),
    },
    pages: {
      retrieve: async ({ page_id }: { page_id: string }) =>
        page_id === "page-1" ? standalonePage : rowPage,
    },
    blocks: {
      children: {
        list: async () => ({
          results: [
            { type: "heading_1", heading_1: { rich_text: [{ plain_text: "Title" }] } },
            { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Body text." }] } },
            { type: "to_do", to_do: { checked: true, rich_text: [{ plain_text: "Ship it" }] } },
          ],
        }),
      },
    },
  };
}

describe("NotionDataSource (mocked client)", () => {
  it("maps database rows correctly, flattening every property type", async () => {
    const source = new NotionDataSource("ntn_test", mockClient());
    const rows = await source.queryDatabase("db-1", undefined, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Notion MCP Server");
    expect(rows[0].properties).toMatchObject({
      Status: "Building",
      Stack: "TypeScript, MCP SDK",
      "Live URL": "https://example.com",
      Score: "42",
      "Built On": "2026-11-13",
    });
  });

  it("filters rows client-side by filter text", async () => {
    const source = new NotionDataSource("ntn_test", mockClient());
    expect(await source.queryDatabase("db-1", "zzz-no-match", 10)).toHaveLength(0);
    expect(await source.queryDatabase("db-1", "Building", 10)).toHaveLength(1);
  });

  it("converts page blocks to markdown-ish text", async () => {
    const source = new NotionDataSource("ntn_test", mockClient());
    const page = await source.getPage("page-1");
    expect(page?.title).toBe("Hello Page");
    expect(page?.text).toContain("# Title");
    expect(page?.text).toContain("Body text.");
    expect(page?.text).toContain("- [x] Ship it");
  });

  it("describes row pages with their parent database id", async () => {
    const source = new NotionDataSource("ntn_test", mockClient());
    expect(await source.describePage("row-1")).toMatchObject({
      exists: true,
      databaseId: "db-1",
      standalone: false,
    });
    expect(await source.describePage("page-1")).toMatchObject({ exists: true, standalone: true });
  });

  it("flattenProperty handles select, checkbox and empty values", () => {
    expect(flattenProperty({ type: "select", select: { name: "Live" } })).toBe("Live");
    expect(flattenProperty({ type: "checkbox", checkbox: false })).toBe("No");
    expect(flattenProperty({ type: "url", url: null })).toBe("");
  });

  it("blockToText renders code blocks with fences", () => {
    expect(
      blockToText({ type: "code", code: { language: "ts", rich_text: [{ plain_text: "let x" }] } }),
    ).toBe("```ts\nlet x\n```");
  });
});

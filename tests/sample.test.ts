import { describe, expect, it } from "vitest";
import { SampleDataSource } from "../src/data/sampleSource.js";

const source = new SampleDataSource();

describe("SampleDataSource", () => {
  it("search finds a known page by its content", async () => {
    const hits = await source.search("allowlist", 10);
    expect(hits.some((h) => h.title === "MCP Security Notes")).toBe(true);
  });

  it("contains the planted prompt-injection fixture page", async () => {
    const page = await source.getPage("sample-page-weekly-sync");
    expect(page?.text).toContain("IGNORE PREVIOUS INSTRUCTIONS");
  });

  it("query_database filters rows by text across properties", async () => {
    const rows = await source.queryDatabase("sample-db-projects", "Anime", 10);
    expect(rows.map((r) => r.title)).toEqual(["AI Anime Tutor"]);
    expect(rows[0].properties.Status).toBe("Live");
  });

  it("query_database without a filter returns all rows up to pageSize", async () => {
    const rows = await source.queryDatabase("sample-db-reading", undefined, 3);
    expect(rows).toHaveLength(3);
  });

  it("the salary database exists in the sample universe (so refusals are testable)", async () => {
    const dbs = await source.listDatabases();
    expect(dbs.some((d) => d.id === "sample-db-salary")).toBe(true);
    const descriptor = await source.describePage("sample-row-salary-1");
    expect(descriptor).toMatchObject({ exists: true, databaseId: "sample-db-salary" });
  });

  it("renders a database row as a page", async () => {
    const page = await source.getPage("sample-row-anime-tutor");
    expect(page?.title).toBe("AI Anime Tutor");
    expect(page?.databaseId).toBe("sample-db-projects");
    expect(page?.text).toContain("Status");
  });
});

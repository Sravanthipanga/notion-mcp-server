import { describe, expect, it } from "vitest";
import { routeQuestion } from "../src/client/router.js";

describe("agent question router (deterministic, no LLM)", () => {
  it("picks the search intent", () => {
    expect(routeQuestion("search MCP security")).toEqual({
      tool: "search_notion",
      query: "MCP security",
    });
    expect(routeQuestion("Search my notes for promptfoo")).toEqual({
      tool: "search_notion",
      query: "promptfoo",
    });
  });

  it("picks the list-databases intent", () => {
    expect(routeQuestion("list databases")).toEqual({ tool: "list_databases" });
  });

  it("picks the database intent with a filter", () => {
    expect(routeQuestion("rows in Project Tracker about Anime")).toEqual({
      tool: "query_database",
      databaseName: "Project Tracker",
      filterText: "Anime",
    });
  });

  it("picks the database intent for 'query the X database'", () => {
    const intent = routeQuestion("query the Salary Database");
    expect(intent.tool).toBe("query_database");
  });

  it("picks the page intent", () => {
    expect(routeQuestion("show page Weekly Sync Notes")).toEqual({
      tool: "get_page",
      title: "Weekly Sync Notes",
    });
  });

  it("falls back to search for free-form questions", () => {
    const intent = routeQuestion("What did I write about observability?");
    expect(intent.tool).toBe("search_notion");
  });
});

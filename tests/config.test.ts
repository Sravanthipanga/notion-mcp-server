import { describe, expect, it } from "vitest";
import { loadConfig, parseAllowlist } from "../src/safety/config.js";
import { SafeError } from "../src/safety/errors.js";

describe("parseAllowlist", () => {
  it("splits on commas, trims whitespace, drops empties and dedupes", () => {
    expect(parseAllowlist(" db-1 ,db-2,, db-1 ,  db-3 ")).toEqual(["db-1", "db-2", "db-3"]);
  });

  it("returns an empty list for undefined or blank input", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("   ")).toEqual([]);
  });
});

describe("loadConfig", () => {
  it("defaults to sample mode and uses the sample allowlist defaults", () => {
    const cfg = loadConfig({}, { databaseIds: ["sample-db-projects"], pageIds: ["p1"] });
    expect(cfg.mode).toBe("sample");
    expect(cfg.allowedDatabaseIds).toEqual(["sample-db-projects"]);
    expect(cfg.allowedPageIds).toEqual(["p1"]);
  });

  it("lets an explicit env allowlist override the sample defaults", () => {
    const cfg = loadConfig(
      { ALLOWED_DATABASE_IDS: "only-this-one" },
      { databaseIds: ["sample-db-projects"], pageIds: [] },
    );
    expect(cfg.allowedDatabaseIds).toEqual(["only-this-one"]);
  });

  it("requires NOTION_TOKEN in notion mode", () => {
    expect(() => loadConfig({ MCP_DATA_MODE: "notion" })).toThrowError(SafeError);
    const cfg = loadConfig({
      MCP_DATA_MODE: "notion",
      NOTION_TOKEN: "ntn_dummy",
      ALLOWED_DATABASE_IDS: "640ec0f6-1ce5-45bf-9420-99898c9f6d13",
    });
    expect(cfg.mode).toBe("notion");
    expect(cfg.allowedDatabaseIds).toEqual(["640ec0f6-1ce5-45bf-9420-99898c9f6d13"]);
  });

  it("rejects an unknown data mode", () => {
    expect(() => loadConfig({ MCP_DATA_MODE: "carrier-pigeon" })).toThrowError(/MCP_DATA_MODE/);
  });
});

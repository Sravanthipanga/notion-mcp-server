import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SafetyGate } from "../src/safety/gate.js";
import { AuditLog, redactSecrets } from "../src/safety/audit.js";
import { clampLimit, truncateText, MAX_PAGE_SIZE, TRUNCATION_MARKER } from "../src/safety/text.js";
import { SafeError } from "../src/safety/errors.js";
import { SampleDataSource, sampleAllowlistDefaults } from "../src/data/sampleSource.js";
import { loadConfig } from "../src/safety/config.js";
import type { DataSource } from "../src/data/types.js";

function buildGate() {
  const source = new SampleDataSource();
  const config = loadConfig({}, sampleAllowlistDefaults());
  return new SafetyGate(source, config, new AuditLog());
}

describe("allowlist enforcement (the choke point)", () => {
  it("allows a listed database", async () => {
    const gate = buildGate();
    const rows = await gate.queryDatabase("sample-db-projects", undefined, 10);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses a database that exists but is NOT on the allowlist", async () => {
    const gate = buildGate();
    await expect(gate.queryDatabase("sample-db-salary", undefined, 10)).rejects.toMatchObject({
      code: "NOT_ALLOWLISTED",
    });
  });

  it("refusal errors have a structured, safe shape", async () => {
    const gate = buildGate();
    const err = await gate
      .queryDatabase("sample-db-salary", undefined, 10)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SafeError);
    const safe = err as SafeError;
    expect(safe.code).toBe("NOT_ALLOWLISTED");
    expect(safe.message).toContain("not on the allowlist");
    expect(safe.message).not.toContain("214750"); // no confidential data in errors
    expect(safe.stack ?? "").not.toContain(safe.message.split("\n")[1] ?? "\u0000");
  });

  it("list_databases only returns allowlisted databases", async () => {
    const gate = buildGate();
    const dbs = await gate.listDatabases();
    expect(dbs.map((d) => d.id)).toEqual(["sample-db-projects", "sample-db-reading"]);
  });

  it("refuses rows of a non-allowlisted database via get_page", async () => {
    const gate = buildGate();
    await expect(gate.getPage("sample-row-salary-1")).rejects.toMatchObject({
      code: "NOT_ALLOWLISTED",
    });
  });
});

describe("limits and truncation", () => {
  it("clamps limits to the documented maximum", () => {
    expect(clampLimit(500)).toBe(MAX_PAGE_SIZE);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit(7)).toBe(7);
  });

  it("passes the clamped pageSize to the data source", async () => {
    let seenPageSize = -1;
    const spy: DataSource = {
      async search() { return []; },
      async getPage() { return null; },
      async describePage() { return { exists: false, standalone: false }; },
      async listDatabases() { return []; },
      async queryDatabase(_id, _f, pageSize) {
        seenPageSize = pageSize;
        return [];
      },
    };
    const gate = new SafetyGate(
      spy,
      { mode: "sample", allowedDatabaseIds: ["db"], allowedPageIds: [] },
      new AuditLog(),
    );
    await gate.queryDatabase("db", undefined, 500);
    expect(seenPageSize).toBe(MAX_PAGE_SIZE);
  });

  it("search respects the requested limit", async () => {
    const gate = buildGate();
    const hits = await gate.search("Notes", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("truncation appends a clear marker at the cap", () => {
    const long = "x".repeat(5000);
    const out = truncateText(long, 4000);
    expect(out.length).toBe(4000 + TRUNCATION_MARKER.length);
    expect(out.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(truncateText("short", 4000)).toBe("short");
  });
});

describe("audit log redaction", () => {
  it("redacts token-shaped strings", () => {
    expect(redactSecrets("token is ntn_abc123XYZ please")).not.toContain("ntn_abc123XYZ");
    expect(redactSecrets("NOTION_TOKEN=secret_xyz")).toContain("[REDACTED]");
    expect(redactSecrets("Bearer abc.def.ghi")).toContain("[REDACTED]");
  });

  it("never writes a fake token into the audit file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "audit-"));
    const file = path.join(dir, "audit.log");
    const log = new AuditLog(file);
    log.record({
      ts: new Date().toISOString(),
      tool: "query_database",
      decision: "deny",
      target: "db-1",
      detail: "caller sent NOTION_TOKEN=ntn_faketoken123 in error",
    });
    const content = readFileSync(file, "utf8");
    expect(content).not.toContain("ntn_faketoken123");
    expect(content).toContain("[REDACTED]");
    expect(content).toContain('"decision":"deny"');
  });
});

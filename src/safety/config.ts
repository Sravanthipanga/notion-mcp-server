import { SafeError } from "./errors.js";

export type DataMode = "sample" | "notion";

export interface AppConfig {
  mode: DataMode;
  /** Only ever read from the environment. Never logged, never committed. */
  notionToken?: string;
  allowedDatabaseIds: string[];
  allowedPageIds: string[];
  auditLogPath?: string;
}

/** Parse a comma-separated env allowlist: split, trim, drop empties, dedupe. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export interface SampleAllowlistDefaults {
  databaseIds: string[];
  pageIds: string[];
}

/**
 * Build the runtime config from the environment.
 *
 * - MCP_DATA_MODE selects the data source ("sample" by default — zero credentials).
 * - In sample mode, an explicit env allowlist overrides the sample dataset's
 *   built-in allowlist; otherwise the dataset defaults apply.
 * - In notion mode, NOTION_TOKEN is required and the allowlists come from env.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  sampleDefaults?: SampleAllowlistDefaults,
): AppConfig {
  const mode = (env.MCP_DATA_MODE ?? "sample").trim().toLowerCase();
  if (mode !== "sample" && mode !== "notion") {
    throw new SafeError(
      "CONFIG_ERROR",
      `MCP_DATA_MODE must be "sample" or "notion" (got "${mode}").`,
    );
  }

  const envDatabases = parseAllowlist(env.ALLOWED_DATABASE_IDS);
  const envPages = parseAllowlist(env.ALLOWED_PAGE_IDS);

  if (mode === "notion") {
    const token = env.NOTION_TOKEN?.trim();
    if (!token) {
      throw new SafeError(
        "CONFIG_ERROR",
        "MCP_DATA_MODE=notion requires NOTION_TOKEN to be set in the environment. " +
          "Create a Notion internal integration and export its secret — never commit it.",
      );
    }
    return {
      mode,
      notionToken: token,
      allowedDatabaseIds: envDatabases,
      allowedPageIds: envPages,
      auditLogPath: env.MCP_AUDIT_LOG_PATH,
    };
  }

  return {
    mode,
    allowedDatabaseIds: envDatabases.length > 0 ? envDatabases : (sampleDefaults?.databaseIds ?? []),
    allowedPageIds: envPages.length > 0 ? envPages : (sampleDefaults?.pageIds ?? []),
    auditLogPath: env.MCP_AUDIT_LOG_PATH,
  };
}

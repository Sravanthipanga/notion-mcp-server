import { appendFileSync } from "node:fs";

/**
 * Audit logging with secret redaction.
 *
 * Every tool call records one JSON line: timestamp, tool name, and the
 * allowlist decision. We NEVER log the Notion token, tool arguments beyond
 * the target id the caller supplied, or page contents.
 */

const SECRET_PATTERNS: RegExp[] = [
  /ntn_[A-Za-z0-9_-]+/g, // Notion integration tokens
  /secret_[A-Za-z0-9_-]+/g, // legacy Notion secrets
  /\b(?:token|secret|api[_-]?key|authorization)\b\s*[:=]\s*\S+/gi,
  /\bBearer\s+\S+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export interface AuditEntry {
  ts: string;
  tool: string;
  decision: "allow" | "deny" | "error";
  /** The id the caller asked about (never an internal-only id, never content). */
  target?: string;
  detail?: string;
}

export class AuditLog {
  constructor(private readonly filePath?: string) {}

  record(entry: AuditEntry): void {
    const safe: AuditEntry = {
      ts: entry.ts,
      tool: entry.tool,
      decision: entry.decision,
      target: entry.target ? redactSecrets(entry.target).slice(0, 200) : undefined,
      detail: entry.detail ? redactSecrets(entry.detail).slice(0, 300) : undefined,
    };
    const line = JSON.stringify(safe);
    // stderr only — stdout is the MCP protocol channel.
    process.stderr.write(`[audit] ${line}\n`);
    if (this.filePath) {
      try {
        appendFileSync(this.filePath, line + "\n", "utf8");
      } catch {
        // Auditing must never crash the server.
      }
    }
  }
}

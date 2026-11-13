/** Structured, safe errors. Messages never contain stack traces or secrets. */
export type SafeErrorCode =
  | "NOT_ALLOWLISTED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFIG_ERROR"
  | "UPSTREAM_ERROR";

export class SafeError extends Error {
  readonly code: SafeErrorCode;
  constructor(code: SafeErrorCode, message: string) {
    super(message);
    this.name = "SafeError";
    this.code = code;
  }
}

export function refusalForDatabase(databaseId: string): SafeError {
  return new SafeError(
    "NOT_ALLOWLISTED",
    `Refused: database "${databaseId}" is not on the allowlist. ` +
      `Only allowlisted databases can be queried. Add the id to ALLOWED_DATABASE_IDS to permit it.`,
  );
}

export function refusalForPage(pageId: string): SafeError {
  return new SafeError(
    "NOT_ALLOWLISTED",
    `Refused: page "${pageId}" is not on the allowlist. ` +
      `Only allowlisted pages (or rows of allowlisted databases) can be read.`,
  );
}

/** Size limits: every input is clamped, every result is capped. */

export const MAX_PAGE_SIZE = 25;
export const DEFAULT_PAGE_SIZE = 10;
/** Hard cap on characters returned by any single tool call. */
export const RESULT_CHAR_CAP = 4000;
export const TRUNCATION_MARKER = "\n...[truncated]";

/** Clamp a caller-supplied limit/pageSize into [1, MAX_PAGE_SIZE]. */
export function clampLimit(value: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < 1) return 1;
  return Math.min(n, MAX_PAGE_SIZE);
}

/** Truncate text at the cap, appending a clear marker when cut. */
export function truncateText(text: string, cap = RESULT_CHAR_CAP): string {
  if (text.length <= cap) return text;
  return text.slice(0, cap) + TRUNCATION_MARKER;
}

/**
 * Helpers for safely building PostgREST filter strings from user input.
 *
 * PostgREST treats `%`, `,`, `(`, `)` and `\` as filter syntax inside `.or()`
 * expressions. Control characters (including null bytes) can also corrupt or
 * split a filter expression. Interpolating a raw search term would let a caller
 * append extra conditions or groups (filter injection), so those characters are
 * replaced with spaces. Trimming and truncating keep the expression bounded,
 * and column names must match a strict identifier allowlist pattern.
 */

const FILTER_SPECIALS = /[\u0000-\u001F\u007F%,()\\]/g;
const COLUMN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function sanitizeSearchTerm(input: string, maxLength = 120): string {
  return input.trim().slice(0, maxLength).replace(FILTER_SPECIALS, " ").replace(/\s+/g, " ").trim();
}

function assertFilterColumn(column: string): void {
  if (!COLUMN_IDENTIFIER.test(column)) {
    throw new Error("Invalid PostgREST filter column");
  }
}

/**
 * Build an `.or()` expression matching `term` against two columns with
 * case-insensitive `ilike`. Only the term is caller-controlled; column names
 * are validated here as an extra defense-in-depth check at every call site.
 */
export function buildIlikeFilter(
  term: string,
  columnA: string,
  columnB: string,
  maxLength = 120,
): string {
  assertFilterColumn(columnA);
  assertFilterColumn(columnB);
  const safe = sanitizeSearchTerm(term, maxLength);
  return `${columnA}.ilike.%${safe}%,${columnB}.ilike.%${safe}%`;
}

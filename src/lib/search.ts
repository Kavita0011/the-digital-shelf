/**
 * Helpers for safely building PostgREST filter strings from user input.
 *
 * PostgREST treats `%`, `,`, `(`, `)` and `\` as filter syntax inside `.or()`
 * expressions. Interpolating a raw search term would let a caller append
 * extra conditions or groups (filter injection), so those characters are
 * replaced with spaces. Trimming and truncating keep the expression bounded.
 */

const FILTER_SPECIALS = /[%,()\\]/g;

export function sanitizeSearchTerm(input: string, maxLength = 120): string {
  return input.trim().slice(0, maxLength).replace(FILTER_SPECIALS, " ").trim();
}

/**
 * Build an `.or()` expression matching `term` against two columns with
 * case-insensitive `ilike`. `columnA`/`columnB` are trusted constants at every
 * call site; only `term` is caller-controlled and it is sanitized here.
 */
export function buildIlikeFilter(
  term: string,
  columnA: string,
  columnB: string,
  maxLength = 120,
): string {
  const safe = sanitizeSearchTerm(term, maxLength);
  return `${columnA}.ilike.%${safe}%,${columnB}.ilike.%${safe}%`;
}

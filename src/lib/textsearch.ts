// textsearch.ts — the ONE free-text search of every list tab (2026-11-04),
// generalised from Generate SVG's: a row matches when every word of the query
// appears, in any case, in one of the fields the tab declares searchable (its
// file name, folder and status words). Each tab only lists its fields; the rule
// lives here, so all lists answer the same query the same way.

/** A searchable value: text, a number, a list (tags), or nothing. */
export type SearchValue = string | number | null | undefined | readonly string[];

/** The query's words, lower-cased; none means "show everything". */
export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter((t) => t !== "");
}

function haystackOf(fields: readonly SearchValue[]): string {
  return fields
    .flatMap((f) => (f === null || f === undefined ? [] : Array.isArray(f) ? f : [String(f)]))
    .join(" \u0000 ") // a word never matches across two fields
    .toLowerCase();
}

/** True when every word of `query` appears in some field ("" matches all). */
export function matchesSearch(query: string, fields: readonly SearchValue[]): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = haystackOf(fields);
  return terms.every((t) => haystack.includes(t));
}

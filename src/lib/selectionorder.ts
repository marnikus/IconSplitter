// selectionorder.ts — the selection is an ORDER, not a set (RULE 10). The
// icons a user picks are paid for one request at a time, and each request's
// contact sheet is drawn cell by cell in that order — so the order must be ONE
// thing: the list of ids the user acted on, in the order they acted. Every
// consumer (the confirmation's plan, the queue's label, the runner's sources)
// reads the rows through this function instead of filtering the row list, which
// would silently answer in scan/sort order and make a preview show a different
// sheet than the request carries.

/**
 * The rows named by `ids`, in the order `ids` gives them. A row that appears
 * twice is returned once (one icon cannot fill two cells of the same sheet),
 * and an id with no row is skipped — the caller decides whether that is a
 * problem.
 */
export function inIdOrder<T>(rows: readonly T[], ids: readonly string[], idOf: (row: T) => string): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const id = idOf(row);
    if (!byId.has(id)) byId.set(id, row);
  }
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const row = byId.get(id);
    if (row === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

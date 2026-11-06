// editnav.ts — ← / → in edit mode (2026-11-06): the previous / next row of the
// list, in the order the list shows it, that can be edited. Never wraps.

/** The nearest editable row before (-1) or after (+1) `id`; null at the end. */
export function neighborRow<R extends { source: { id: string } }>(rows: readonly R[], id: string, dir: 1 | -1, editable: (r: R) => boolean): R | null {
  const at = rows.findIndex((r) => r.source.id === id);
  for (let i = at + dir; i >= 0 && i < rows.length; i += dir) if (editable(rows[i])) return rows[i];
  return null;
}

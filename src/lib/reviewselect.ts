// reviewselect.ts — pure multi-selection model for the review list (RULE 3/8).
// Checked rows are pair ids kept SEPARATE from review status; every helper is
// scope-aware so bulk actions never silently touch rows hidden by filters.

export type CheckState = "unchecked" | "checked" | "indeterminate";

/** Adds an unchecked id, removes a checked one (row checkbox). */
export function toggleId(checked: readonly string[], id: string): string[] {
  return checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
}

/** "Select all": union of the visible ids into the existing selection. */
export function unionIds(checked: readonly string[], visible: readonly string[]): string[] {
  const out = [...checked];
  for (const id of visible) if (!checked.includes(id)) out.push(id);
  return out;
}

/** Tri-state of the header checkbox over the VISIBLE scope only. */
export function headerCheck(checked: readonly string[], visible: readonly string[]): CheckState {
  if (visible.length === 0) return "unchecked";
  const on = new Set(checked);
  const hits = visible.filter((id) => on.has(id)).length;
  if (hits === 0) return "unchecked";
  return hits === visible.length ? "checked" : "indeterminate";
}

/** Checked ids that are currently visible — the "Approve selected" scope. */
export function intersectIds(checked: readonly string[], visible: readonly string[]): string[] {
  const vis = new Set(visible);
  return checked.filter((id) => vis.has(id));
}

/** Checked rows the current filters hide — reported, never silently acted on. */
export function hiddenIds(checked: readonly string[], visible: readonly string[]): string[] {
  const vis = new Set(visible);
  return checked.filter((id) => !vis.has(id));
}

/** Rescan safety: drop ids whose pair vanished; keep the rest in order. */
export function pruneIds(checked: readonly string[], alive: readonly string[]): string[] {
  return intersectIds(checked, alive);
}

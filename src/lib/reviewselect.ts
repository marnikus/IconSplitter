// reviewselect.ts — pure checkbox-selection state for Selection review V2.
// Owns: adding/removing one or many ids, the header checkbox state (including
// indeterminate) and the visible-scope intersection a bulk action may touch.
// Selection is keyed by stable pairId so filtering/sorting never loses it, and
// it stays deliberately separate from review status (spec V2 §5, §9).

export type CheckState = "none" | "some" | "all";

/** Adds one id, or removes it when already checked. */
export function toggleChecked(checked: readonly string[], id: string): string[] {
  return checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
}

/** Adds (`on`) or removes every id in `ids` — select-all / deselect-all. */
export function setChecked(checked: readonly string[], ids: readonly string[], on: boolean): string[] {
  if (!on) return checked.filter((x) => !ids.includes(x));
  return [...new Set([...checked, ...ids])];
}

/** Header checkbox state for the currently visible ids (indeterminate = some). */
export function checkState(visibleIds: readonly string[], checked: readonly string[]): CheckState {
  const on = checkedInView(visibleIds, checked).length;
  if (on === 0) return "none";
  return on === visibleIds.length ? "all" : "some";
}

/** Checked ids that are also visible, in visible order — the bulk scope. */
export function checkedInView(visibleIds: readonly string[], checked: readonly string[]): string[] {
  const on = new Set(checked);
  return visibleIds.filter((id) => on.has(id));
}

export type SelectIntent = "replace" | "range" | "toggle";

/** File-Explorer modifiers: shift extends a range, ctrl/alt/meta toggles one row. */
export function selectIntent(mods: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): SelectIntent {
  if (mods.shiftKey) return "range";
  if (mods.ctrlKey || mods.altKey || mods.metaKey) return "toggle";
  return "replace";
}

/** A plain click: this row alone. */
export function selectOne(id: string): string[] {
  return [id];
}

/**
 * Shift+click: every row between the anchor and the target, in list order. With
 * no usable anchor — first click, or an anchor a filter has hidden — this
 * degrades to selecting the clicked row, never to an empty or wrong range.
 */
export function selectRange(order: readonly string[], anchor: string | null, id: string): string[] {
  const to = order.indexOf(id);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (to < 0 || from < 0) return selectOne(id);
  const low = Math.min(from, to);
  return order.slice(low, Math.max(from, to) + 1);
}

export interface RowSelection {
  checked: string[];
  active: string | null;
  anchor: string | null;
}

export interface RowGesture {
  id: string;
  intent: SelectIntent;
  visibleIds: readonly string[];
}

/** Batch-style row gestures keep the active row separate from checked rows. */
export function applyRowGesture(before: RowSelection, gesture: RowGesture): RowSelection {
  const { id, intent, visibleIds } = gesture;
  if (!visibleIds.includes(id)) return before;
  if (intent === "replace") return { ...before, active: id, anchor: id };
  const checked = intent === "range"
    ? selectRange(visibleIds, before.anchor, id)
    : toggleChecked(before.checked, id);
  return { checked, active: id, anchor: intent === "range" ? id : before.anchor };
}

/** Avoid adding a history entry when a gesture left all three values intact. */
export function sameRowSelection(a: RowSelection, b: RowSelection): boolean {
  return a.active === b.active && a.anchor === b.anchor
    && a.checked.length === b.checked.length
    && a.checked.every((id, i) => id === b.checked[i]);
}

/** A completed scan removes targets that no longer name a source. */
export function pruneRowSelection(before: RowSelection, known: ReadonlySet<string>): RowSelection {
  return {
    checked: before.checked.filter((id) => known.has(id)),
    active: before.active !== null && known.has(before.active) ? before.active : null,
    anchor: before.anchor !== null && known.has(before.anchor) ? before.anchor : null,
  };
}

/** Arrow navigation follows the same visible order as Shift selection. */
export function nextVisibleId(order: readonly string[], active: string | null, step: 1 | -1): string | null {
  if (order.length === 0) return null;
  const at = active === null ? -1 : order.indexOf(active);
  if (at < 0) return step === 1 ? order[0] : order[order.length - 1];
  return order[Math.min(Math.max(at + step, 0), order.length - 1)];
}

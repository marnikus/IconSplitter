// slots.ts — an EMPTY cell in the middle of the sheet (Shift+× on the artboard).
// The placement list is positional (index = cell); a hole is a unique placeholder
// id `~empty:N`, so the shared selection history and diff keep working. These ids
// are never asset ids: composition, export, counts and picks skip them.

const PREFIX = "~empty:";
/** The largest grid is 100 × 100 (2026-11-23); every possible placeholder id is known up front (undo validation). */
export const MAX_SLOTS = 100 * 100;
export const ALL_EMPTY_SLOTS: readonly string[] = Array.from({ length: MAX_SLOTS }, (_, i) => `${PREFIX}${i}`);

export function isEmptySlot(id: string): boolean {
  return id.startsWith(PREFIX);
}

/** `count` placeholder ids not used in `ids`, lowest first — one pass, however big the sheet (2026-11-23). */
export function freshEmpty(ids: readonly string[], count: number): string[] {
  const used = new Set(ids);
  const out: string[] = [];
  for (let i = 0; out.length < count; i++) if (!used.has(`${PREFIX}${i}`)) out.push(`${PREFIX}${i}`);
  return out;
}

/** A placeholder id not yet used in `ids`. */
export function emptySlotFor(ids: readonly string[]): string {
  return freshEmpty(ids, 1)[0];
}

/** The cells up to `capacity`, the missing ones empty. */
export function padEmpty(ids: readonly string[], capacity: number): string[] {
  return [...ids, ...freshEmpty(ids, Math.max(0, capacity - ids.length))];
}

/** The same cells with every icon `drop` names emptied (each cell kept, a fresh placeholder). */
export function withEmptyFor(ids: readonly string[], drop: (id: string) => boolean): string[] {
  const fresh = freshEmpty(ids, ids.filter((id) => !isEmptySlot(id) && drop(id)).length);
  let k = 0;
  return ids.map((id) => (!isEmptySlot(id) && drop(id) ? fresh[k++] : id));
}

/** Only the real asset ids, in order. */
export function placedOnly(ids: readonly string[]): string[] {
  return ids.filter((id) => !isEmptySlot(id));
}

/** Trailing holes mean nothing (cells after the list are empty anyway). */
export function trimTrailingEmpty(ids: readonly string[]): string[] {
  let end = ids.length;
  while (end > 0 && isEmptySlot(ids[end - 1])) end--;
  return ids.slice(0, end);
}

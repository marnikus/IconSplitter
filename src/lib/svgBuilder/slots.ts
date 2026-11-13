// slots.ts — an EMPTY cell in the middle of the sheet (Shift+× on the artboard).
// The placement list is positional (index = cell); a hole is a unique placeholder
// id `~empty:N`, so the shared selection history and diff keep working. These ids
// are never asset ids: composition, export, counts and picks skip them.

const PREFIX = "~empty:";
/** The largest grid is 16 × 12; every possible placeholder id is known up front (undo validation). */
export const MAX_SLOTS = 16 * 12;
export const ALL_EMPTY_SLOTS: readonly string[] = Array.from({ length: MAX_SLOTS }, (_, i) => `${PREFIX}${i}`);

export function isEmptySlot(id: string): boolean {
  return id.startsWith(PREFIX);
}

/** A placeholder id not yet used in `ids`. */
export function emptySlotFor(ids: readonly string[]): string {
  const used = new Set(ids);
  return ALL_EMPTY_SLOTS.find((id) => !used.has(id)) ?? `${PREFIX}${ids.length}`;
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

// multifilter.ts — multi-choice list filters, shared by every tab (2026-11-06).
// A filter dropdown's value is its "all" value (no filter), ONE value (the old
// single-choice shape — stored filters and history entries stay valid) or
// several values; a row passes when it matches ANY picked value. Each tab keeps
// its own single-value test and wraps it with `anyOf`. Pure (RULE 3/8).

/** "all", one value, or several. */
export type Multi<T extends string> = T | readonly T[];

/** The picked values; empty means everything passes. */
export function pickedOf<T extends string>(want: Multi<T> | undefined, all: T): readonly T[] {
  if (want === undefined) return [];
  if (typeof want === "string") return want === all ? [] : [want];
  return want.filter((v) => v !== all);
}

/** True when nothing narrows the list. */
export function isAllPicked<T extends string>(want: Multi<T> | undefined, all: T): boolean {
  return pickedOf(want, all).length === 0;
}

/** A row passes when nothing is picked or `test` holds for ANY picked value. */
export function anyOf<T extends string>(want: Multi<T> | undefined, all: T, test: (one: T) => boolean): boolean {
  const picked = pickedOf(want, all);
  return picked.length === 0 || picked.some(test);
}

/** The canonical shape: none → all, one → that value, every option → all, else the list. */
function normalized<T extends string>(picked: readonly T[], all: T, options: readonly T[]): Multi<T> {
  if (picked.length === 0) return all;
  if (options.length > 1 && options.every((o) => picked.includes(o))) return all;
  return picked.length === 1 ? picked[0] : picked;
}

/** One click on an option: "all" resets; any other value is added or removed (option order kept). */
export function toggleMulti<T extends string>(want: Multi<T>, value: T, all: T, options: readonly T[]): Multi<T> {
  if (value === all) return all;
  const now = new Set(pickedOf(want, all));
  if (now.has(value)) now.delete(value);
  else now.add(value);
  const ordered = [...options.filter((o) => now.has(o)), ...[...now].filter((v) => !options.includes(v))];
  return normalized(ordered, all, options);
}

/** A value that no longer exists (a deleted badge) leaves the filter. */
export function dropFromMulti<T extends string>(want: Multi<T>, value: T, all: T): Multi<T> {
  const rest = pickedOf(want, all).filter((v) => v !== value);
  return rest.length === 0 ? all : rest.length === 1 ? rest[0] : rest;
}

/** A stored value: one allowed value, or a list of them (unknown ones dropped); else all (RULE 13). */
export function parseMulti<T extends string>(raw: unknown, allowed: readonly T[], all: T): Multi<T> {
  if (typeof raw === "string") return allowed.includes(raw as T) ? (raw as T) : all;
  if (!Array.isArray(raw)) return all;
  const kept = [...new Set(raw.filter((v): v is T => typeof v === "string" && allowed.includes(v as T) && v !== all))];
  return kept.length === 0 ? all : kept.length === 1 ? kept[0] : kept;
}

/** "Generating + Generated"; "" when nothing is picked. */
export function multiText<T extends string>(want: Multi<T> | undefined, all: T, labelOf: (v: T) => string = (v) => v): string {
  return pickedOf(want, all).map(labelOf).join(" + ");
}

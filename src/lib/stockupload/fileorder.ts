// fileorder.ts — the order a site that sorts by name must receive its icons in:
// the number the user put in front of every file name, ascending (0001, 0002,
// 0003 …). Discovery groups the icons by folder, which is a filing order, not a
// plan; Shutterstock and Adobe Stock list a folder by name, so the upload has to
// walk the names.

/** The last segment of a relative path (`a/b/c.jpg` → `c.jpg`). */
function leafOf(name: string): string {
  return String(name ?? "").split(/[\\/]/).pop() ?? "";
}

/**
 * The number a leaf starts with (`0154-icon-waving-flag` → 154), or null when the
 * name carries no plan — an unnumbered export keeps its name order instead.
 */
export function leadingNumber(name: string): number | null {
  const match = /^(\d+)/.exec(leafOf(name));
  const value = match === null ? Number.NaN : Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** The leaf split into digit and non-digit runs, case-insensitively. */
function runParts(name: string): string[] {
  return leafOf(name).toLowerCase().match(/\d+|\D+/g) ?? [];
}

/** Two runs of the same kind compare by value for digits, by code point otherwise. */
function compareRun(a: string, b: string): number {
  if (/^\d/.test(a) && /^\d/.test(b)) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `icon_2` before `icon_10`: run by run, so digits are numbers, not characters. */
function compareRuns(a: string, b: string): number {
  const [ra, rb] = [runParts(a), runParts(b)];
  for (let i = 0; i < Math.min(ra.length, rb.length); i += 1) {
    const diff = compareRun(ra[i], rb[i]);
    if (diff !== 0) return diff;
  }
  return ra.length - rb.length;
}

/** Numbered icons first and ascending, then the unnumbered ones by name. */
export function compareIconNames(a: string, b: string): number {
  const [na, nb] = [leadingNumber(a), leadingNumber(b)];
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na === null && nb !== null) return 1;
  if (na !== null && nb === null) return -1;
  return compareRuns(a, b);
}

/** The icons of one target as indexes in that order; equal names keep list order. */
export function numericIconOrder(names: readonly string[]): number[] {
  return names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => compareIconNames(a.name, b.name) || a.index - b.index)
    .map((entry) => entry.index);
}

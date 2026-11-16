// foldernames.ts — whose file is this, by NAME alone (SVGs 2026-11-01, AI sources
// 2026-11-02). One rule for both kinds of file, so the two "register what is
// already there" passes can never disagree about a name:
//
//   <stem>.svg            the pair's own file          (download-icon-01_AI_01.svg)
//   <stem>_v3.svg         the number the name carries  (v3)
//   <stem>-copy.svg       an unnumbered copy           (the next free number)
//
// A split pair ALSO answers to the names it had BEFORE the split, so
// `download-icon-01_AI.svg` beside `download-icon-01_AI_01.png` is this pair's.
// When two pairs in one folder could claim the same name, the LONGEST matching
// name wins; a tie belongs to nobody (it is reported, never guessed).
//
// Pure: no disk, no React. The callers read the files and validate their content.

import { compareNames } from "./scan";

/** How a pair is named on disk: its AI file's stem, plus the name it had first. */
export interface Naming {
  /** `download-icon-01_AI_01` — the AI image's file name without its extension. */
  stem: string;
  /** `download-icon-01` — the pair's base, before the `_AI` and the split suffix. */
  base: string;
}

/** Separators a foreign tool puts between the name and its own suffix. */
const SEPARATORS = ["_", " ", "-", "(", "."];

/** Every name this pair answers to, longest first: the stem, then its earlier names. */
export function prefixesOf(n: Naming): string[] {
  const all = [n.stem, `${n.base}_AI`, n.base].map((p) => p.toLowerCase()).filter((p) => p !== "");
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}

/** A name without its extension, lowercased — the folder's case is not a fact. */
function bareName(name: string, ext: string): string | null {
  return name.toLowerCase().endsWith(ext) ? name.slice(0, -ext.length).toLowerCase() : null;
}

/**
 * How well this file name matches one of the prefixes: the length of the longest
 * prefix it carries (0 = not this pair). Case-insensitive, because the folder and
 * the AI image can differ in case on a case-insensitive drive.
 */
export function matchLength(name: string, prefixes: readonly string[], ext = ".svg"): number {
  const bare = bareName(name, ext);
  if (bare === null) return 0;
  let best = 0;
  for (const prefix of prefixes) {
    if (bare === prefix || SEPARATORS.some((sep) => bare.startsWith(`${prefix}${sep}`))) {
      best = Math.max(best, prefix.length);
    }
  }
  return best;
}

/** Whose file is this? `self` = ours, `other` = a sibling pair's, `shared` = a tie. */
export function ownerOf(
  name: string, self: Naming, siblings: readonly Naming[], ext = ".svg",
): "self" | "other" | "shared" {
  const own = matchLength(name, prefixesOf(self), ext);
  if (own === 0) return "other";
  let best = 0;
  let claimedBy = 0;
  for (const sibling of siblings) {
    const theirs = matchLength(name, prefixesOf(sibling), ext);
    if (theirs > best) best = theirs;
    if (theirs === own) claimedBy++;
  }
  if (best > own) return "other"; // a longer name in the same folder is a better match
  if (claimedBy > 0) return "shared"; // two pairs answer to the same name: never guess
  return "self";
}

/** One file the plan picked, with the version number it becomes. */
export interface NumberedFile {
  name: string;
  version: number;
}

/**
 * The versions the picked files become. A name that carries a number keeps it;
 * an unnumbered file (a copy, a rename) takes the next free one, so nothing on
 * disk is invisible and nothing is counted twice.
 */
export function assignNumbers(
  candidates: readonly string[], numberOf: (name: string) => number | null, taken: Set<number>,
): NumberedFile[] {
  const out: NumberedFile[] = [];
  const deferred: string[] = [];
  const named = candidates.map((name) => ({ name, version: numberOf(name) }));
  for (const item of named.sort((a, b) => (a.version ?? 0) - (b.version ?? 0) || compareNames(a.name, b.name))) {
    if (item.version === null || taken.has(item.version)) { deferred.push(item.name); continue; }
    taken.add(item.version);
    out.push({ name: item.name, version: item.version });
  }
  for (const name of deferred.sort(compareNames)) {
    const version = freeAfter(taken);
    taken.add(version);
    out.push({ name, version });
  }
  return out.sort((a, b) => a.version - b.version);
}

/** The lowest number above everything already taken — deterministic, never a gap. */
export function freeAfter(taken: Set<number>): number {
  return (taken.size === 0 ? 0 : Math.max(...taken)) + 1;
}

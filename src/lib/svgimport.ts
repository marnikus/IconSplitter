// Register SVGs that were already in the folder (Generate SVG tab, 2026-11-01).
//
// The tab only knows SVG files it wrote itself: they are listed in the pair's own
// file. An SVG made elsewhere — an earlier build, another tool, a hand edit — sits
// beside the AI image and the tab shows nothing, so the work has to be re-generated
// or copied by hand. This module turns the FILE NAMES into the version records the
// tab would have written, so one scan is enough:
//
//   <stem>.svg          -> v1          (download-icon-01_AI_01.svg)
//   <stem>_v3.svg       -> v3          (the number the name carries)
//   <stem>-copy.svg     -> the next free number, after the named ones
//
// The name a split pair had BEFORE the split counts too: a file called
// `download-icon-01_AI.svg` beside `download-icon-01_AI_01.png` was made for this
// artwork, so it is registered rather than ignored. When two pairs in one folder
// could claim the same file, the LONGEST matching name wins; a tie belongs to
// nobody (it is reported, never guessed).
//
// Files the pair file already records are never added twice. Pure: no disk, no
// React — the caller reads the files and validates their content.

import { versionOfFileName } from "./svgfile";
import { compareNames } from "./scan";
import type { SvgVersion } from "./svgmodel";

/** One SVG file found in the pair's folder, with the version it becomes. */
export interface ExistingSvg {
  name: string;
  version: number;
}

/** How a pair is named on disk: its AI file's stem, plus the name it had first. */
export interface Naming {
  /** `download-icon-01_AI_01` — the AI image's file name without its extension. */
  stem: string;
  /** `download-icon-01` — the pair's base, before the `_AI` and the split suffix. */
  base: string;
}

export interface ImportPlan {
  /** Files to add, ascending by version — one record each. */
  fresh: ExistingSvg[];
  /** Files the pair file already records (by name) — nothing to do. */
  known: string[];
  /** SVG files in the folder that are another pair's (or nobody's) — said out loud. */
  others: string[];
  /** The newest version this pair will have once the plan is applied. */
  latest: number | null;
}

const SVG_SUFFIX = ".svg";
/** Separators a foreign tool puts between the name and its own suffix. */
const SEPARATORS = ["_", " ", "-", "(", "."];

/** Every name this pair answers to, longest first: the stem, then its earlier names. */
export function prefixesOf(n: Naming): string[] {
  const all = [n.stem, `${n.base}_AI`, n.base].map((p) => p.toLowerCase()).filter((p) => p !== "");
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}

/**
 * How well this file name matches one of the prefixes: the length of the longest
 * prefix it carries (0 = not this pair). Case-insensitive, because the folder and
 * the AI image can differ in case on a case-insensitive drive.
 */
export function matchLength(name: string, prefixes: readonly string[]): number {
  if (!name.toLowerCase().endsWith(SVG_SUFFIX)) return 0;
  const base = name.slice(0, -SVG_SUFFIX.length).toLowerCase();
  let best = 0;
  for (const prefix of prefixes) {
    if (base === prefix || SEPARATORS.some((sep) => base.startsWith(`${prefix}${sep}`))) {
      best = Math.max(best, prefix.length);
    }
  }
  return best;
}

/** Is this file an SVG of THIS pair — its stem or one of its earlier names? */
export function relatedTo(stem: string, name: string, aliases: readonly string[] = []): boolean {
  if (stem === "") return false;
  return matchLength(name, prefixesOf({ stem, base: aliases[0] ?? "" })) > 0;
}

/** The name a version record points at (root-relative paths end in it). */
function nameOf(svgPath: string): string {
  const parts = svgPath.split("/");
  return parts[parts.length - 1];
}

/** Names of the files the pair's own history already points at. */
function knownNames(versions: readonly SvgVersion[]): Set<string> {
  const out = new Set<string>();
  for (const v of versions) if (v.svgPath !== "") out.add(nameOf(v.svgPath));
  return out;
}

/** Whose file is this? `self` = ours, `other` = a sibling pair's, `shared` = a tie. */
function ownerOf(name: string, self: Naming, siblings: readonly Naming[]): "self" | "other" | "shared" {
  const own = matchLength(name, prefixesOf(self));
  if (own === 0) return "other";
  let best = 0;
  let claimedBy = 0;
  for (const sibling of siblings) {
    const theirs = matchLength(name, prefixesOf(sibling));
    if (theirs > best) best = theirs;
    if (theirs === own) claimedBy++;
  }
  if (best > own) return "other"; // a longer name in the same folder is a better match
  if (claimedBy > 0) return "shared"; // two pairs answer to the same name: never guess
  return "self";
}

/**
 * The versions one folder's files become. A name that carries a number keeps it;
 * an unnumbered file (a copy, a rename) takes the next free one, so nothing on
 * disk is invisible and nothing is counted twice.
 */
export function planImport(
  self: Naming, files: readonly string[], versions: readonly SvgVersion[], siblings: readonly Naming[] = [],
): ImportPlan {
  const known = knownNames(versions);
  const isSvg = files.filter((n) => n.toLowerCase().endsWith(SVG_SUFFIX)).sort(compareNames);
  const knownFiles = isSvg.filter((n) => known.has(n));
  const mine = isSvg.filter((n) => !known.has(n) && ownerOf(n, self, siblings) === "self");
  const others = isSvg.filter((n) => !known.has(n) && ownerOf(n, self, siblings) !== "self");
  const taken = new Set<number>(versions.map((v) => v.version));
  for (const name of knownFiles) {
    const parsed = versionOfFileName(name, self.stem);
    if (parsed !== null) taken.add(parsed);
  }
  const fresh = assign(mine, self.stem, taken);
  const all = [...taken, ...fresh.map((f) => f.version)];
  return { fresh, known: knownFiles, others, latest: all.length === 0 ? null : Math.max(...all) };
}

/**
 * Named files keep their own number first (a v3 stays v3 even when a copy sorts
 * before it), then the unnumbered ones take the next free numbers in name order.
 */
function assign(candidates: readonly string[], stem: string, taken: Set<number>): ExistingSvg[] {
  const out: ExistingSvg[] = [];
  const deferred: string[] = [];
  const named = candidates.map((name) => ({ name, version: versionOfFileName(name, stem) }));
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
function freeAfter(taken: Set<number>): number {
  return (taken.size === 0 ? 0 : Math.max(...taken)) + 1;
}

/** The version the row should show once these records are in: the newest readable one. */
export function newestReadable(versions: readonly SvgVersion[]): number | null {
  const usable = versions.filter((v) => v.status === "generated" && v.validation.ok);
  return usable.length === 0 ? null : Math.max(...usable.map((v) => v.version));
}

export interface ImportTally {
  /** Records written across every selected folder. */
  registered: number;
  /** Files that matched the pair but could not be read or did not validate. */
  skipped: number;
  /** Folders the scan looked in. */
  folders: number;
  /** The newest version now shown, when one was registered. */
  shown: number | null;
  /** SVG files the folders hold that are another pair's (or nobody's). */
  others?: readonly string[];
  /** The one pair this was about, when a single row was selected. */
  stem?: string;
}

/** One honest line for the toast: what happened, and what did not (RULE 9). */
export function importSummary(t: ImportTally): { text: string; err: boolean } {
  if (t.registered > 0) {
    const shown = t.shown === null ? "" : ` — v${t.shown} is now shown`;
    const skipped = t.skipped === 0 ? "" : ` · ${t.skipped} skipped (not a valid SVG)`;
    return {
      text: `${t.registered} existing SVG${t.registered === 1 ? "" : "s"} registered${shown}${skipped}${otherNote(t.others ?? [])}`,
      err: false,
    };
  }
  if (t.skipped > 0) {
    return { text: `${t.skipped} SVG file${t.skipped === 1 ? "" : "s"} found but none could be registered`, err: true };
  }
  return { text: nothingText(t), err: false };
}

/** The other SVGs the folder held, said briefly so a wrong file is noticed at once. */
function otherNote(others: readonly string[]): string {
  return others.length === 0 ? "" : ` · ${others.length} other SVG${others.length === 1 ? "" : "s"} there ${others.length === 1 ? "is" : "are"} not this pair's`;
}

/** Nothing to register: name the pair and, when there are some, the other SVGs seen. */
function nothingText(t: ImportTally): string {
  const of = t.stem === undefined ? "this pair" : t.stem;
  const where = `${t.folders} selected folder${t.folders === 1 ? "" : "s"}`;
  const others = t.others ?? [];
  if (others.length === 0) return `No existing SVG for ${of} in ${where}`;
  const example = others[0] === undefined ? "" : ` (e.g. ${others[0]})`;
  return `No existing SVG for ${of} in ${where} — ${others.length} other SVG${others.length === 1 ? "" : "s"} there ${others.length === 1 ? "is" : "are"} not this pair's${example}`;
}

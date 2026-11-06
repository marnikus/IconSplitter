// Register AI SOURCE images that were already in the folder (Generate SVG tab,
// 2026-11-02). The same idea as lib/svgimport one step earlier in the pipeline:
//
//   the pair already shows its own `<stem>.png`   -> nothing to register
//   `<stem>_v3.png` (a regeneration no record names) -> v3, and it becomes MAIN
//   `<stem>-copy.png`, a pre-split name            -> the next free number
//
// A split pair answers to the names it had BEFORE the split (lib/foldernames), so
// `download-icon-01_AI.png` inside `download-icon-01_AI/split_01/` is this pair's
// source rather than a stranger's. Two rules keep this honest:
//
//   * the pair's own AI image and its reference image are never re-registered —
//     the app already shows them, so a folder with only those changes nothing;
//   * only a name that CARRIES a version number (`_vN`) can move the main image.
//     An unnumbered file (a copy, the pre-split original) is taken in under the
//     next free number so nothing is invisible, but it never silently replaces
//     the image the pair shows.
//
// Pure: no disk, no React — the caller lists the folder and reads the files.

import {
  assignNumbers, matchLength, ownerOf, prefixesOf, type Naming,
} from "./foldernames";
import { compareNames } from "./scan";
import type { ImageVersion } from "./svgimgreg";

/** One image file found on disk, with the path the pair file must record. */
export interface ScannedImage {
  name: string;
  /** Root-relative path — in the pair's folder or its version folder. */
  path: string;
}

/** One image this pass will record, with the version it becomes. */
export interface FreshImage extends ScannedImage {
  version: number;
}

export interface ImagePlan {
  fresh: FreshImage[];
  /** Files the pair file already records (by name) — nothing to do. */
  known: string[];
  /** PNGs this pair could claim but a sibling pair owns (or a tie) — said out loud. */
  others: string[];
  /** The highest number a registered file's NAME carried: the new main image. */
  named: number | null;
  /** The highest number this pair will use once the plan is applied. */
  latest: number | null;
}

const PNG_SUFFIX = ".png";

/** The file name a root-relative path ends in. */
function nameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

/** Is this name one of the images the app already knows (the original, the reference)? */
function skipped(name: string, skip: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return skip.some((s) => s.toLowerCase() === lower);
}

/**
 * The version an image name carries: `<prefix>_v3.png` is v3, the bare
 * `<prefix>.png` carries none. Only the app's own `_vN` convention counts — the
 * numeric tail of a split name (`..._AI_01.png`) is part of the NAME.
 */
function numberOf(name: string, prefixes: readonly string[]): number | null {
  const bare = name.slice(0, -PNG_SUFFIX.length).toLowerCase();
  for (const prefix of prefixes) {
    const m = new RegExp(`^${escape(prefix)}_v(\\d+)$`).exec(bare);
    if (m !== null) return Number(m[1]);
  }
  return null;
}

function escape(text: string): string {
  return text.replace(/[.*+?${}()|[\]\\]/g, "\\$&");
}

/** Files the pair file already points at, by name. */
function knownNames(versions: readonly ImageVersion[]): Set<string> {
  const out = new Set<string>();
  for (const v of versions) if (v.file !== "") out.add(nameOf(v.file));
  return out;
}

/** What the pass knows before it looks: the pair, the folder, its history, the folder's other pairs. */
export interface ImagePlanInput {
  /** The pair doing the looking. */
  self: Naming;
  /** Every PNG the pair's folder and its version folder hold. */
  files: readonly ScannedImage[];
  /** The pair's own image history. */
  versions: readonly ImageVersion[];
  /** Pairs that share the folder — only they can contest a name. */
  siblings?: readonly Naming[];
  /** Names the app already shows (its AI image and its reference) — never re-registered. */
  skip?: readonly string[];
}

/**
 * What one folder's images become: ours, already known, and somebody else's —
 * then numbered so nothing collides with the history.
 */
export function planImageImport(input: ImagePlanInput): ImagePlan {
  const { self, files, versions } = input;
  const prefixes = prefixesOf(self);
  const known = knownNames(versions);
  const pngs = files.filter((f) => f.name.toLowerCase().endsWith(PNG_SUFFIX)).sort((a, b) => compareNames(a.name, b.name));
  const usable = pngs.filter((f) => !known.has(f.name) && !skipped(f.name, input.skip ?? []));
  const mine = usable.filter((f) => ownerOf(f.name, self, input.siblings ?? [], PNG_SUFFIX) === "self");
  const others = usable.filter((f) => isContested(f.name, input, prefixes));
  const taken = takenNumbers(versions, pngs.filter((p) => known.has(p.name)), prefixes);
  const numbered = assignNumbers(mine.map((f) => f.name), (name) => numberOf(name, prefixes), taken);
  const fresh = numbered.flatMap((n) => {
    const file = mine.find((f) => f.name === n.name);
    return file === undefined ? [] : [{ ...file, version: n.version }];
  });
  const all = [...taken, ...fresh.map((f) => f.version)];
  return {
    fresh,
    known: pngs.filter((p) => known.has(p.name)).map((p) => p.name),
    others: others.map((o) => o.name),
    named: namedOf(fresh, prefixes),
    latest: all.length === 0 ? null : Math.max(...all),
  };
}

/** A PNG this pair could claim by name but a sibling pair owns (or a tie): said out loud. */
function isContested(name: string, input: ImagePlanInput, prefixes: readonly string[]): boolean {
  if (ownerOf(name, input.self, input.siblings ?? [], PNG_SUFFIX) === "self") return false;
  return matchLength(name, prefixes, PNG_SUFFIX) > 0;
}

/** The numbers the pair's history and its already-known file names use. */
function takenNumbers(
  versions: readonly ImageVersion[], knownFiles: readonly ScannedImage[], prefixes: readonly string[],
): Set<number> {
  const taken = new Set<number>(versions.map((v) => v.version));
  for (const file of knownFiles) {
    const parsed = numberOf(file.name, prefixes);
    if (parsed !== null) taken.add(parsed);
  }
  return taken;
}

/** The newest version a NAME carried — never an unnumbered file's assigned number. */
function namedOf(fresh: readonly FreshImage[], prefixes: readonly string[]): number | null {
  const named = fresh.filter((f) => numberOf(f.name, prefixes) === f.version).map((f) => f.version);
  return named.length === 0 ? null : Math.max(...named);
}

export interface ImageTally {
  /** Image records written across every selected folder. */
  registered: number;
  /** Files that matched the pair but could not be read as a PNG. */
  skipped: number;
  /** Folders the scan looked in. */
  folders: number;
  /** The version now shown as the main image, when one was registered. */
  shown: number | null;
  /** The one pair this was about, when a single row was selected. */
  stem?: string;
  /** The pair's own AI file, so a no-op can point at what is already there. */
  original?: string;
  /** PNGs the folders hold that this pair could claim but does not own. */
  others?: readonly string[];
}

/** One honest line for the toast: what happened, and what did not (RULE 9). */
export function imageSummary(t: ImageTally): { text: string; err: boolean } {
  if (t.registered > 0) {
    const main = t.shown === null ? "the main image did not change" : `v${t.shown} is now the main image`;
    const skipped = t.skipped === 0 ? "" : ` · ${t.skipped} skipped (not a readable PNG)`;
    return {
      text: `${t.registered} existing AI source${t.registered === 1 ? "" : "s"} registered — ${main}${skipped}${otherNote(t.others ?? [])}`,
      err: false,
    };
  }
  if (t.skipped > 0) return { text: `${t.skipped} PNG file${t.skipped === 1 ? "" : "s"} found but none could be registered`, err: true };
  return { text: nothingText(t), err: false };
}

/** The other PNGs seen, said briefly so a wrong file is noticed at once. */
function otherNote(others: readonly string[]): string {
  return others.length === 0 ? "" : ` · ${others.length} other PNG${others.length === 1 ? "" : "s"} there ${others.length === 1 ? "is" : "are"} not this pair's`;
}

/** Nothing to register: name the pair and what the folder already holds. */
function nothingText(t: ImageTally): string {
  const of = t.stem === undefined ? "this pair" : t.stem;
  const where = `${t.folders} selected folder${t.folders === 1 ? "" : "s"}`;
  const others = t.others ?? [];
  const line = `No other AI source for ${of} in ${where}`;
  if (others.length > 0) {
    const example = others[0] === undefined ? "" : ` (e.g. ${others[0]})`;
    return `${line} — ${others.length} other PNG${others.length === 1 ? "" : "s"} there ${others.length === 1 ? "is" : "are"} not this pair's${example}`;
  }
  if (t.original !== undefined) return `${line} — the original ${t.original} is already its image`;
  return line;
}

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
// artwork, so it is registered rather than ignored (see lib/foldernames, which the
// AI-source pass shares). Files the pair file already records are never added
// twice. Pure: no disk, no React — the caller reads and validates the files.

import { versionOfFileName } from "./svgfile";
import { compareNames } from "./scan";
import { assignNumbers, matchLength, ownerOf, prefixesOf as prefixes, type Naming } from "./foldernames";
import type { SvgVersion } from "./svgmodel";

export { prefixesOf, type Naming } from "./foldernames";

/** One SVG file found in the pair's folder, with the version it becomes. */
export interface ExistingSvg {
  name: string;
  version: number;
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

/** Is this file an SVG of THIS pair — its stem or one of its earlier names? */
export function relatedTo(stem: string, name: string, aliases: readonly string[] = []): boolean {
  if (stem === "") return false;
  return matchLength(name, prefixes({ stem, base: aliases[0] ?? "" })) > 0;
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

/** The version number an SVG name carries, or null when it carries none. */
function numberOf(name: string, stem: string): number | null {
  return versionOfFileName(name, stem);
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
    const parsed = numberOf(name, self.stem);
    if (parsed !== null) taken.add(parsed);
  }
  const fresh = assignNumbers(mine, (name) => numberOf(name, self.stem), taken);
  const all = [...taken, ...fresh.map((f) => f.version)];
  return { fresh, known: knownFiles, others, latest: all.length === 0 ? null : Math.max(...all) };
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

/** A recorded version to re-check: its file is in the folder, its record hides it. */
export interface RepairFile { name: string; version: number; replaces: number }

/**
 * Hidden versions (2026-11-06 report: v1, v3 shown — v4 on disk): a record that
 * is failed, interrupted or invalid while its file IS in the folder is checked
 * again like a found file. It takes the number its NAME says when that number
 * is free (rank by name), else keeps its own.
 */
export function planRepairs(self: Naming, files: readonly string[], versions: readonly SvgVersion[]): RepairFile[] {
  const onDisk = new Set(files.map((f) => f.toLowerCase()));
  const used = new Set(versions.map((v) => v.version));
  const out: RepairFile[] = [];
  for (const v of versions) {
    if ((v.status === "generated" && v.validation.ok) || v.svgPath === "") continue;
    const name = nameOf(v.svgPath);
    if (!onDisk.has(name.toLowerCase())) continue;
    const named = numberOf(name, self.stem);
    const version = named !== null && (named === v.version || !used.has(named)) ? named : v.version;
    used.add(version);
    out.push({ name, version, replaces: v.version });
  }
  return out;
}

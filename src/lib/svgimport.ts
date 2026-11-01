// Register SVGs that were already in the folder (Generate SVG tab, 2026-11-01).
//
// The tab only knows SVG files it wrote itself: they are listed in the pair's own
// file. An SVG made elsewhere — an earlier build, another tool, a hand edit — sits
// beside the AI image and the tab shows nothing, so the work has to be re-generated
// or copied by hand. This module turns the FILE NAMES into the version records the
// tab would have written, so one scan is enough:
//
//   <stem>.svg          -> v1
//   <stem>_v3.svg       -> v3
//   <stem>-copy.svg     -> the next free number, after the named ones
//
// Names that do not belong to the pair (`other.svg`, `<stem>.svg.json`) are left
// alone; files the pair file already records are never added twice. Pure: no disk,
// no React — the caller reads the files and validates their content.

import { versionOfFileName } from "./svgfile";
import { compareNames } from "./scan";
import type { SvgVersion } from "./svgmodel";

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
  /** The newest version this pair will have once the plan is applied. */
  latest: number | null;
}

const SVG_SUFFIX = ".svg";
/** Separators a foreign tool puts between the stem and its own suffix. */
const SEPARATORS = ["_", " ", "-", "(", "."];

/** Is this file an SVG of THIS pair — its stem, or its stem plus a suffix? */
export function relatedTo(stem: string, name: string): boolean {
  if (stem === "" || !name.toLowerCase().endsWith(SVG_SUFFIX)) return false;
  const base = name.slice(0, -SVG_SUFFIX.length);
  if (base === stem) return true;
  return SEPARATORS.some((sep) => base.startsWith(`${stem}${sep}`));
}

/** The file name a version record points at (root-relative paths end in it). */
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

/**
 * The versions one folder's files become. A name that carries a number keeps it;
 * an unnumbered file (a copy, a rename) takes the next free one, so nothing on
 * disk is invisible and nothing is counted twice.
 */
export function planImport(stem: string, files: readonly string[], versions: readonly SvgVersion[]): ImportPlan {
  const known = knownNames(versions);
  const knownFiles = files.filter((n) => known.has(n)).sort(compareNames);
  const candidates = files.filter((n) => relatedTo(stem, n) && !known.has(n)).sort(compareNames);
  const taken = new Set<number>(versions.map((v) => v.version));
  for (const name of knownFiles) {
    const parsed = versionOfFileName(name, stem);
    if (parsed !== null) taken.add(parsed);
  }
  const fresh = assign(candidates, stem, taken);
  const all = [...taken, ...fresh.map((f) => f.version)];
  return { fresh, known: knownFiles, latest: all.length === 0 ? null : Math.max(...all) };
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
}

/** One honest line for the toast: what happened, and what did not (RULE 9). */
export function importSummary(t: ImportTally): { text: string; err: boolean } {
  if (t.registered === 0 && t.skipped === 0) {
    return { text: `No existing SVG in ${t.folders} selected folder${t.folders === 1 ? "" : "s"}`, err: false };
  }
  if (t.registered === 0) {
    return { text: `${t.skipped} SVG file${t.skipped === 1 ? "" : "s"} found but none could be registered`, err: true };
  }
  const shown = t.shown === null ? "" : ` — v${t.shown} is now shown`;
  const skipped = t.skipped === 0 ? "" : ` · ${t.skipped} skipped (not a valid SVG)`;
  return { text: `${t.registered} existing SVG${t.registered === 1 ? "" : "s"} registered${shown}${skipped}`, err: false };
}

// scan.ts — scanning the picked root for the Generate SVG tab (prompt §1).
// Owns: restoring the remembered root handle, recursive approved-source
// discovery, loading every sidecar, and the honest report of what could not be
// used (missing AI image, unreadable file, corrupt decision file).

import type { DirHandleLike } from "../lib/fs";
import { log } from "../log/logstore";
import { loadHandles, saveHandles } from "../batch/store";
import { discoverApprovedSources, type Discovery, type SvgSource } from "./sources";
import { loadSidecar } from "./sidecar";
import { saveSourceIndex, type IndexEntry } from "./sourceindex";
import { pruneChecked, toRow } from "./rowmodel";
import { SVG_HANDLE_KEY } from "./reviewundo";
import type { SvgRefs, SvgRow } from "./types";

/** The setters a scan writes through: whole-array rows are correct here,
 *  because a rescan replaces every row at once. */
export interface ScanSetters {
  setRootName: (name: string) => void;
  setRows: (rows: SvgRow[]) => void;
  setDiscovery: (d: Discovery | null) => void;
  setBusy: (b: string | null) => void;
  /** Called once per scan: every row re-reads the SVG it previews. */
  setRootToken: () => void;
  say: (msg: string, err?: boolean) => void;
}

export interface BootArgs {
  setRootName: (name: string) => void;
  loadAll: () => void;
  refreshKey: () => void;
}

/** Scans the root, loads every sidecar and reports what could not be used. */
export async function scanSources(refs: SvgRefs, s: ScanSetters): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (!root) return;
  s.setBusy("Scanning approved sources…");
  try {
    const found = await discoverApprovedSources(root);
    const rows: SvgRow[] = [];
    for (const source of found.sources) {
      const load = await loadSidecar(root, source);
      refs.sidecars.set(source.id, load.sidecar);
      rows.push(toRow(source, load.sidecar, load.corrupt));
    }
    s.setRows(rows);
    s.setDiscovery(found);
    s.setRootToken();
    logScan(found, rows.length);
    saveSourceIndex(found.sources.map(toIndexEntry));
    pruneChecked(rows);
    reportScan(found, s.say);
  } catch {
    log({ level: "error", feature: "svg", action: "scan-failed", detail: "the scan failed — the folder may be unreadable" });
    s.say("Rescan failed — the folder may be unreadable", true);
  } finally {
    s.setBusy(null);
  }
}

/** What a scan found, so an empty or partial list is never a mystery (§3). */
function logScan(found: Discovery, eligible: number): void {
  log({
    feature: "svg", action: "scan", detail: `found ${eligible} approved source(s)`,
    data: {
      eligible, approved: found.approvedTotal, missing: found.missing.length,
      unreadable: found.unreadable.length, corruptDecisions: found.corruptDecisions,
    },
  });
  for (const warning of scanWarnings(found)) {
    log({ level: "warn", feature: "svg", action: "scan-warning", detail: warning });
  }
}

function scanWarnings(found: Discovery): string[] {
  return [
    ...(found.corruptDecisions ? ["review-decisions.json could not be parsed — kept the previous decisions in memory"] : []),
    ...(found.missing.length > 0 ? [`${found.missing.length} approved pair(s) lost their AI image since the last scan`] : []),
    ...(found.unreadable.length > 0 ? [`${found.unreadable.length} file(s) could not be read and were skipped`] : []),
  ];
}

function reportScan(found: Discovery, say: (m: string, e?: boolean) => void): void {
  if (found.corruptDecisions) say("review-decisions.json is corrupt — kept the previous decisions in memory", true);
  if (found.missing.length > 0) say(`${found.missing.length} approved pair(s) lost their AI image since the last scan`, true);
  if (found.unreadable.length > 0) say(`${found.unreadable.length} file(s) could not be read and were skipped`, true);
}

/** Restores the remembered root: this tab's handle, else the Selection tab's. */
export async function bootSources(refs: SvgRefs, s: BootArgs): Promise<void> {
  const stored = (await loadHandles(SVG_HANDLE_KEY))?.source ?? (await loadHandles("__selection__"))?.source ?? null;
  if (!stored) return;
  refs.root.current = stored;
  s.setRootName(stored.name);
  s.loadAll();
  s.refreshKey();
}

/** Remembers the folder the user picked for this tab. */
export async function rememberRoot(handle: DirHandleLike): Promise<void> {
  await saveHandles(SVG_HANDLE_KEY, { source: handle });
}

function toIndexEntry(source: SvgSource): IndexEntry {
  return { id: source.id, relPath: source.relPath, name: source.name, fingerprint: source.fingerprint };
}

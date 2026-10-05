// scan.ts — scanning the picked root for the Generate SVG tab (prompt §1).
// Owns: restoring the remembered root handle, recursive approved-source
// discovery, loading every sidecar, and committing ONE complete snapshot.
// The whole snapshot is built before any state is touched, an unchanged
// snapshot commits nothing, only the newest scan may commit, and the cache
// write can no longer half-commit a scan (design D6/D7).

import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { beginScan, isCurrent } from "../lib/scanseq";
import { loadHandles, saveHandles } from "../batch/store";
import { discoverApprovedSources, type Discovery, type SvgSource } from "./sources";
import { scanKey } from "./scankey";
import { loadSidecar } from "./sidecar";
import { saveSourceIndex, type IndexEntry } from "./sourceindex";
import { pruneChecked, toRow } from "./rowmodel";
import type { SvgSidecar } from "../lib/svgfile";
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

/** Scans the root, loads every sidecar and commits one complete snapshot. */
export async function scanSources(refs: SvgRefs, s: ScanSetters): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (!root) return;
  const ticket = beginScan(refs.seq.current);
  refs.seq.current = ticket.seq;
  s.setBusy("Scanning approved sources…");
  try {
    const found = await discoverApprovedSources(root);
    const loaded = await loadRows(root, found.sources);
    if (!isCurrent(refs.seq.current, ticket.id)) return; // a newer scan took over
    const key = scanKey(root.name, found, loaded.rows);
    if (key === refs.scanKey.current) return; // same folder, same snapshot: nothing to do
    commit({ refs, setters: s, discovery: found, loaded, key });
    logScan(found);
    reportScan(found, s.say);
  } catch {
    if (isCurrent(refs.seq.current, ticket.id)) {
      log({ level: "error", feature: "svg", action: "scan-failed", detail: "the scan failed — the folder may be unreadable" });
      s.say("Rescan failed — the folder may be unreadable", true);
    }
  } finally {
    if (isCurrent(refs.seq.current, ticket.id)) s.setBusy(null);
  }
}

interface LoadedRows {
  rows: SvgRow[];
  sidecars: [string, SvgSidecar | null][];
}

/** Reads every sidecar into memory first — no state is touched while reading. */
async function loadRows(root: DirHandleLike, sources: SvgSource[]): Promise<LoadedRows> {
  const rows: SvgRow[] = [];
  const sidecars: [string, SvgSidecar | null][] = [];
  for (const source of sources) {
    const load = await loadSidecar(root, source);
    sidecars.push([source.id, load.sidecar]);
    rows.push(toRow(source, load.sidecar, load.corrupt));
  }
  return { rows, sidecars };
}

/** Everything one commit needs, so the commit stays one parameter (RULE 16). */
interface Commit {
  refs: SvgRefs;
  setters: ScanSetters;
  discovery: Discovery;
  loaded: LoadedRows;
  key: string;
}

/** The single commit: state first, then the cache that must never fail a scan. */
function commit(c: Commit): void {
  for (const [id, sidecar] of c.loaded.sidecars) c.refs.sidecars.set(id, sidecar);
  c.setters.setRows(c.loaded.rows);
  c.setters.setDiscovery(c.discovery);
  c.setters.setRootToken();
  c.refs.scanKey.current = c.key;
  pruneChecked(c.loaded.rows);
  saveIndex(c.discovery.sources);
}

function saveIndex(sources: SvgSource[]): void {
  try {
    saveSourceIndex(sources.map(toIndexEntry));
  } catch {
    // the index is a cache: its failure is not a scan failure
  }
}

/** What a scan found, so an empty or partial list is never a mystery (§3). */
function logScan(found: Discovery): void {
  log({
    feature: "svg", action: "scan", detail: `found ${found.sources.length} approved source(s)`,
    data: {
      eligible: found.sources.length, problems: found.problems.length,
      unreadable: found.unreadable.length, corruptDecisions: found.corruptDecisions,
    },
  });
}

/** The user message and the log entry share one wording (RULE 10). */
function reportScan(found: Discovery, say: (m: string, e?: boolean) => void): void {
  for (const warning of scanWarnings(found)) {
    say(warning, true);
    log({ level: "warn", feature: "svg", action: "scan-warning", detail: warning });
  }
}

function scanWarnings(found: Discovery): string[] {
  return [
    ...(found.corruptDecisions ? ["review-decisions.json is corrupt — kept the previous decisions in memory"] : []),
    ...(found.problems.length > 0 ? [`${found.problems.length} approved pair(s) need attention — the reason is on the row`] : []),
    ...(found.unreadable.length > 0 ? [`${found.unreadable.length} file(s) could not be read and are marked unreadable`] : []),
  ];
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

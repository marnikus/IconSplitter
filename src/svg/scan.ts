// scan.ts — scanning the picked root for the Generate SVG tab (prompt §1).
// Owns: restoring the remembered root handle, recursive approved-source
// discovery, loading every pair file, and committing ONE complete snapshot.
// The whole snapshot is built before any state is touched, an unchanged
// snapshot commits nothing, only the newest scan may commit, and the cache
// write can no longer half-commit a scan (design D6/D7).

import { rememberKnownRoot } from "../ui/knownroots";
import { retryCapture } from "../ui/rootcapture";
import { loadRootPath } from "../lib/rootpath";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { beginScan, isCurrent } from "../lib/scanseq";
import { loadHandles, saveHandles } from "../batch/store";
import { discoverApprovedSources, type Discovery, type SvgSource } from "./sources";
import { auditText, exclusionSummary } from "./sourcelist";
import { scanKey } from "./scankey";
import { metaPathFor } from "../lib/pairmeta";

import { saveSourceIndex, type IndexEntry } from "../state/sourceindex";
import { pruneChecked, toRow } from "./rowmodel";
import type { PairMeta } from "../lib/pairmeta";
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

/** Scans the root, loads every pair file and commits one complete snapshot. */
export async function scanSources(refs: SvgRefs, s: ScanSetters): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (!root) return;
  const captured = await retryCapture(root); // before any await: the click's own gesture (I-52)
  if (captured !== null) s.say(captured);
  const ticket = beginScan(refs.seq.current);
  refs.seq.current = ticket.seq;
  s.setBusy("Scanning approved sources…");
  try {
    const found = await discoverApprovedSources(root);
    const loaded = loadRows(found);
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
  metas: [string, PairMeta | null][];
}

/**
 * Rows from the records discovery ALREADY read: one pass over the pair files
 * serves both, so a scan reads each file once and can never show a row whose
 * record it did not see (I-41).
 */
function loadRows(found: Discovery): LoadedRows {
  const metas: [string, PairMeta | null][] = [];
  const rows = found.sources.map((source) => {
    const meta = found.metas.get(source.id) ?? null;
    metas.push([source.id, meta]);
    return toRow(source, meta, found.corruptFiles.includes(metaPathOf(source)));
  });
  return { rows, metas };
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
  for (const [id, meta] of c.loaded.metas) c.refs.metas.set(id, meta);
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
    feature: "svg", action: "scan", detail: auditText(found.audit),
    data: {
      eligible: found.sources.length, problems: found.problems.length,
      excluded: found.excluded.length, unreadable: found.unreadable.length,
      corruptDecisions: found.corruptDecisions, ...found.audit,
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
    ...(found.excluded.length > 0 ? [`${found.excluded.length} approved source(s) are not listed — ${exclusionSummary(found.excluded)}; the audit names every count`] : []),
    ...(found.problems.length > 0 ? [`${found.problems.length} listed source(s) need attention — the reason is on the row`] : []),
    ...(found.unreadable.length > 0 ? [`${found.unreadable.length} file(s) could not be read and are marked unreadable`] : []),
  ];
}

/** Restores the remembered root: this tab's handle, else the Selection tab's. */
export async function bootSources(refs: SvgRefs, s: BootArgs): Promise<void> {
  const stored = (await loadHandles(SVG_HANDLE_KEY))?.source ?? (await loadHandles("__selection__"))?.source ?? null;
  if (!stored) return;
  refs.root.current = stored;
  rememberKnownRoot(stored, loadRootPath(stored.name)); // a restored folder names its children (I-51)
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

/** The pair file a listed source owns — what a corrupt file is reported against. */
function metaPathOf(source: SvgSource): string {
  return metaPathFor({
    pairId: source.id, base: source.base, suffix: source.suffix, relDir: source.dirPath,
    source: null, ai: { relPath: source.relPath, size: 0, mtime: 0, error: null }, created: 0, generated: null,
  });
}

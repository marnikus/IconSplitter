// rootsource.ts — where the Selection tabs' root comes from, and the one scan
// that may commit a snapshot. Moved out of useSelection so that file stays
// inside the RULE 18 size budget (it grew with the pick-time path capture).
// Owns: the remembered handle at boot, the picker every tab goes through
// (I-35: the picked folder's real path is captured from the clipboard), and the
// ticket-guarded rescan (a stale scan never commits).

import { readDirTree, type DirHandleLike } from "../lib/fs";
import { pairEntries, type ReviewPair } from "../lib/pairing";
import type { FileEntry } from "../lib/scan";
import { walkTree } from "../lib/scan";
import { pairIdOfMetaPath } from "../lib/pairmeta";
import { directoryNames, scopeOf, scopeText, splitPairs, type ScanScope } from "../lib/splitscope";
import { log } from "../log/logstore";
import { beginScan, isCurrent, type ScanSeq } from "../lib/scanseq";
import type { ViewPair } from "../lib/reviewfilter";
import { loadHandles, saveHandles } from "../batch/store";
import { pickFolderFor } from "../ui/pickroot";
import { getAppState, patchV2, patchView } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { pruneIds } from "../lib/session";
import { loadPairDecisions, type PairLoad } from "./pairstore";
import { SELECTION_HANDLE_KEY } from "./offline";
import { applyScan, type SelState } from "./state";
import { saveSourceIndex } from "../state/sourceindex";

export type Setter = React.Dispatch<React.SetStateAction<SelState>>;

/** Mutable context shared by the orchestration functions (grouped, RULE 3). */
export interface Ctx {
  root: { current: DirHandleLike | null };
  state: { current: SelState };
  hist: HistoryApi;
  /** Which rescan may commit (see lib/scanseq) — the watcher can overlap one. */
  seq: { current: ScanSeq };
}

type Say = (m: string, e?: boolean) => void;

/** Restores the remembered folder on mount, if the user ever picked one. */
export async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  const stored = await loadHandles(SELECTION_HANDLE_KEY);
  const h = stored?.source ?? null;
  if (!h) return;
  setRoot(ctx, setS, h);
  await rescan(ctx, setS, () => undefined);
}

/** The picker both Selection tabs use: pick, capture the path, scan (I-35). */
export async function chooseRoot(ctx: Ctx, setS: Setter, say: Say): Promise<void> {
  const picked = await pickFolderFor((h: DirHandleLike) => {
    setRoot(ctx, setS, h);
    void saveHandles(SELECTION_HANDLE_KEY, { source: h });
  });
  if (!picked) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
  await rescan(ctx, setS, say);
  if (picked.message !== null) say(picked.message);
}

export function setRoot(ctx: Ctx, setS: Setter, h: DirHandleLike): void {
  ctx.root.current = h;
  setS((p) => ({ ...p, rootName: h.name }));
}

/** Walks the root and commits one snapshot — only if it is still the newest. */
export async function rescan(ctx: Ctx, setS: Setter, say: Say): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  const ticket = beginScan(ctx.seq.current);
  ctx.seq.current = ticket.seq;
  setS((p) => ({ ...p, busy: "Scanning folders…" }));
  try {
    const walked = await walkAndLoad(root);
    if (!isCurrent(ctx.seq.current, ticket.id)) return; // a newer scan took over
    // The root's name comes from the handle that was just walked, never from a
    // state snapshot taken before the pick: React may batch a scan commit with
    // the pick's own update, and the snapshot would then carry the OLD name and
    // win (the pill would fall back to "Choose source folder…" — observed).
    commit(ctx, setS, say, { ...walked, rootName: root.name });
  } catch {
    if (isCurrent(ctx.seq.current, ticket.id)) say("Rescan failed — the folder may be unreadable", true);
  } finally {
    if (isCurrent(ctx.seq.current, ticket.id)) setS((p) => ({ ...p, busy: null }));
  }
}

/** What one walk produced: the reviewable pairs, the scope and the records. */
interface Walked {
  pairs: ReviewPair[];
  scope: ScanScope;
  load: PairLoad;
}

async function walkAndLoad(root: DirHandleLike): Promise<Walked> {
  const { pairs, scope, entries } = await scanRoot(root);
  return { pairs, scope, load: await loadPairDecisions(root, entries) };
}

/** The single commit: state, then the cache the undo paths read, then the report. */
function commit(
  ctx: Ctx, setS: Setter, say: Say,
  w: Walked & { rootName: string },
): void {
  const scanLoad = {
    records: w.load.records, corrupt: w.load.legacyCorrupt,
    corruptIds: w.load.corruptFiles.map(pairIdOfMetaPath).filter((id) => id !== ""),
    corruptFiles: w.load.corruptFiles,
  };
  const prevScope = ctx.state.current.scope; // read before the commit, to compare
  const next = { ...applyScan(ctx.state.current, w.pairs, scanLoad, Date.now()), rootName: w.rootName, scope: w.scope };
  setS(next);
  patchView({ selectedId: next.selectedId });
  savePairIndex(next.pairs); // the undo paths find each pair's own file by id
  pruneChecked(next.pairs); // a restored check must not point at a removed pair
  announce(prevScope, w.scope, say);
  reportReads(w.load, say);
}

/**
 * Walks the root once and decides the reviewable set (I-38): when the tree holds
 * a split-output folder, that folder's pairs are the set and the main folder's
 * unsplit sheets are counted as outside; otherwise every pair is reviewable, so a
 * folder that never saw a batch behaves exactly as before.
 */
async function scanRoot(root: DirHandleLike): Promise<{ pairs: ReviewPair[]; scope: ScanScope; entries: FileEntry[] }> {
  const tree = await readDirTree(root, []);
  const scoped = scopeOf(directoryNames(tree), root.name);
  const entries = walkTree(tree, []);
  const { pairs, outside } = splitPairs(pairEntries(entries), scoped);
  return { pairs, scope: { split: scoped, outside: outside.length }, entries };
}

/** The id -> AI path cache every cross-tab undo reads (state/sourceindex). */
function savePairIndex(pairs: readonly ViewPair[]): void {
  try {
    saveSourceIndex(pairs.flatMap((p) => (p.ai === null ? [] : [{
      id: p.pairId, relPath: p.ai.relPath, name: p.ai.relPath.split("/").pop() ?? p.ai.relPath,
      fingerprint: `${p.ai.size}:${p.ai.mtime}`,
    }])));
  } catch {
    // the index is a cache: its failure must never fail a scan
  }
}

/** An unreadable pair file is named, never silently turned into "pending" (I-43). */
function reportReads(load: PairLoad, say: Say): void {
  if (load.corruptFiles.length > 0) {
    const files = load.corruptFiles.slice(0, 3).join(", ");
    say(`${load.corruptFiles.length} pair file(s) could not be read: ${files} — their decisions kept in memory`, true);
    log({ level: "warn", feature: "selection", action: "pair-file-unreadable", detail: load.corruptFiles.join(", ") });
  }
  if (load.legacyCorrupt) say("review-decisions.json is corrupt — kept previous decisions in memory", true);
}

/**
 * Says the scope once per change — never on every watcher tick, so a 30 s
 * rescan stays quiet while a fresh pick explains why the list is short (I-40).
 */
function announce(before: ScanScope, scope: ScanScope, say: Say): void {
  if (before.split === scope.split && before.outside === scope.outside) return;
  if (!scope.split) return;
  say(scopeText(scope));
  log({ feature: "selection", action: "scan-scope", detail: scopeText(scope) });
}

function pruneChecked(pairs: ViewPair[]): void {
  const checked = getAppState().v2.checked;
  const kept = pruneIds(checked, new Set(pairs.map((p) => p.pairId)));
  if (kept.length !== checked.length) patchV2({ checked: kept });
}

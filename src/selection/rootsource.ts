// rootsource.ts — where the Selection tabs' root comes from, and the one scan
// that may commit a snapshot. Moved out of useSelection so that file stays
// inside the RULE 18 size budget (it grew with the pick-time path capture).
// Owns: the remembered handle at boot, the picker every tab goes through
// (I-35: the picked folder's real path is captured from the clipboard), and the
// ticket-guarded rescan (a stale scan never commits).

import { readDirTree, type DirHandleLike } from "../lib/fs";
import { pairEntries } from "../lib/pairing";
import { walkTree } from "../lib/scan";
import { beginScan, isCurrent, type ScanSeq } from "../lib/scanseq";
import type { ViewPair } from "../lib/reviewfilter";
import { loadHandles, saveHandles } from "../batch/store";
import { pickFolderFor } from "../ui/pickroot";
import { getAppState, patchV2, patchView } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { pruneIds } from "../lib/session";
import { loadDecisions } from "./reviewstore";
import { SELECTION_HANDLE_KEY } from "./offline";
import { applyScan, type SelState } from "./state";

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
    const tree = await readDirTree(root, []);
    const pairs = pairEntries(walkTree(tree, []));
    const load = await loadDecisions(root);
    if (!isCurrent(ctx.seq.current, ticket.id)) return; // a newer scan took over
    // The root's name comes from the handle that was just walked, never from a
    // state snapshot taken before the pick: React may batch a scan commit with
    // the pick's own update, and the snapshot would then carry the OLD name and
    // win (the pill would fall back to "Choose source folder…" — observed).
    const next = { ...applyScan(ctx.state.current, pairs, load, Date.now()), rootName: root.name };
    setS(next);
    patchView({ selectedId: next.selectedId });
    pruneChecked(next.pairs); // a restored check must not point at a removed pair
    if (load.corrupt) say("review-decisions.json is corrupt — kept previous decisions in memory", true);
  } catch {
    if (isCurrent(ctx.seq.current, ticket.id)) say("Rescan failed — the folder may be unreadable", true);
  } finally {
    if (isCurrent(ctx.seq.current, ticket.id)) setS((p) => ({ ...p, busy: null }));
  }
}

function pruneChecked(pairs: ViewPair[]): void {
  const checked = getAppState().v2.checked;
  const kept = pruneIds(checked, new Set(pairs.map((p) => p.pairId)));
  if (kept.length !== checked.length) patchV2({ checked: kept });
}

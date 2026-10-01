// useReview.ts — orchestration for the Selection tab (spec §1–§9; RULE 2/4/24).
// Owns: root picking and restore, the recursive scan, decision updates with
// honest persistence reporting, filters, selection and the comparison window.
// Everything it drives is separately tested (src/lib/review*.ts, ./persist.ts,
// ./scan.ts, ./useCompare.ts) — this file only wires them to React state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveFileHandle, type DirHandleLike } from "../lib/fs";
import { rescanNote, stampName } from "../lib/reviewformat";
import type { Decision, DecisionRecord } from "../lib/reviewfile";
import type { ReviewStatus } from "../lib/reviewio";
import {
  applyDecisions, nextPendingId, orphanRecords, tally, withDecision,
  type Counts, type ReviewItem,
} from "../lib/reviewmerge";
import { applyQuery, defaultQuery, mergeQuery, type QueryPatch, type ReviewQuery } from "../lib/reviewquery";
import type { ReviewPair } from "../lib/review";
import { ensurePermission, fsSupported, pickDirectory } from "../batch/picker";
import type { ToastMsg } from "../ui/Overlays";
import { useThumbnails } from "../ui/useThumbnails";
import { flushItems, loadAndSync, resetReviewFile, type FileState } from "./persist";
import { scanPairs } from "./scan";
import { loadReviewRoot, saveReviewRoot } from "./store";
import { useCompare, type CompareDetail } from "./useCompare";

interface ReviewState {
  rootName: string;
  items: ReviewItem[];
  orphans: DecisionRecord[];
  counts: Counts;
  query: ReviewQuery;
  selectedId: string | null;
  busy: string | null;
  toast: ToastMsg | null;
  fileStatus: "idle" | ReviewStatus | "write-error";
  fileNote: string | null;
  scanNote: string;
  scanStamp: number;
}

interface Ctx {
  root: { current: DirHandleLike | null };
  pairs: { current: ReviewPair[] };
  state: { current: ReviewState };
}

type Setter = React.Dispatch<React.SetStateAction<ReviewState>>;

const CLEARED_FILTERS: QueryPatch = { scope: { mode: "all", month: "", from: "", to: "" }, status: "all" };

export function useReview() {
  const [s, setS] = useState<ReviewState>(initialState);
  const ctx = useCtx(s);
  const scan = useCallback(() => { void runScan(ctx, setS); }, [ctx]);
  useEffect(() => { void boot(ctx, setS); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useToastClear(s.toast, setS);
  const view = useMemo(() => applyQuery(s.items, s.query), [s.items, s.query]);
  const item = view.find((i) => i.id === s.selectedId) ?? null;
  const detail = useCompare(ctx.root.current, item);
  const thumbs = useThumbnails(useCallback((relPath: string) => thumbUrl(ctx, relPath), [ctx]));
  useEffect(() => { thumbs.clear(); }, [s.rootName, s.scanStamp, thumbs]);
  return { s, view, item, detail, thumbs, ...useActions(ctx, setS, scan) };
}

export interface ReviewApi extends ReturnType<typeof useActions> {
  s: ReviewState;
  view: ReviewItem[];
  item: ReviewItem | null;
  detail: CompareDetail;
  thumbs: ReturnType<typeof useThumbnails>;
}

function initialState(): ReviewState {
  return {
    rootName: "", items: [], orphans: [], counts: tally([]), query: defaultQuery(),
    selectedId: null, busy: null, toast: null, fileStatus: "idle", fileNote: null,
    scanNote: "Choose the split root to review its images", scanStamp: 0,
  };
}

function useCtx(s: ReviewState): Ctx {
  const state = useRef(s);
  state.current = s; // render mirror so async callbacks read live state (RULE 24)
  return { root: useRef(null), pairs: useRef([]), state };
}

function useActions(ctx: Ctx, setS: Setter, scan: () => void) {
  return {
    supported: fsSupported(),
    rescan: scan,
    pickRoot: () => { void pickRoot(ctx, setS); },
    decide: (id: string, decision: Decision) => { void decideNow(ctx, setS, id, decision); },
    retry: () => { void retryNow(ctx, setS); },
    resetFile: () => { void resetNow(ctx, setS); },
    openItem: (id: string | null) => setS((p) => ({ ...p, selectedId: id })),
    step: (delta: number) => stepSelection(ctx, setS, delta),
    setQuery: (patch: QueryPatch) => setS((p) => ({ ...p, query: mergeQuery(p.query, patch) })),
    clearFilters: () => setS((p) => ({ ...p, query: mergeQuery(p.query, CLEARED_FILTERS) })),
    openPath: (relPath: string) => openPathNow(ctx, setS, relPath),
  };
}

function useToastClear(toast: ToastMsg | null, setS: Setter): void {
  useEffect(() => {
    const t = toast ? setTimeout(() => setS((p) => ({ ...p, toast: null })), 5000) : 0;
    return () => clearTimeout(t);
  }, [toast, setS]);
}

/** Restores the folder used last time, if the browser still lets us read it. */
async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  try {
    const handle = await loadReviewRoot();
    if (!handle || !(await ensurePermission(handle))) return;
    ctx.root.current = handle;
    setS((p) => ({ ...p, rootName: handle.name }));
    await runScan(ctx, setS);
  } catch (e) {
    setS((p) => ({ ...p, toast: { msg: `Could not restore the last folder — ${messageOf(e)}`, err: true } }));
  }
}

async function pickRoot(ctx: Ctx, setS: Setter): Promise<void> {
  const handle = await pickDirectory();
  if (!handle) return void setS((p) => ({ ...p, toast: { msg: "Folder picking needs Chrome or Edge — or was cancelled", err: true } }));
  ctx.root.current = handle;
  await saveReviewRoot(handle);
  setS((p) => ({ ...p, rootName: handle.name, selectedId: null }));
  await runScan(ctx, setS);
}

async function runScan(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return void setS((p) => ({ ...p, toast: { msg: "Choose a folder to review first", err: true } }));
  setS((p) => ({ ...p, busy: "Scanning images…" }));
  try {
    const pairs = await scanPairs(root);
    const note = rescanNote(ctx.pairs.current, pairs);
    ctx.pairs.current = pairs;
    finishScan(setS, await loadAndSync(root, pairs, nowIso()), pairs, note);
  } catch (e) {
    setS((p) => ({ ...p, busy: null, toast: { msg: messageOf(e) || "Scan failed", err: true } }));
  }
}

/** Mirrors a finished scan into state: list, counters, history and warnings. */
function finishScan(setS: Setter, state: FileState, pairs: ReviewPair[], note: string): void {
  const items = applyDecisions(pairs, state.file.records);
  setS((p) => ({
    ...p,
    busy: null,
    items,
    orphans: orphanRecords(state.file.records, pairs),
    counts: tally(items),
    fileStatus: state.status,
    fileNote: state.reason,
    scanNote: note,
    scanStamp: p.scanStamp + 1,
    selectedId: items.some((i) => i.id === p.selectedId) ? p.selectedId : null,
    toast: scanToast(state, note, items.length),
  }));
}

function scanToast(state: FileState, note: string, total: number): ToastMsg {
  if (state.status !== "ok") return { msg: state.reason ?? note, err: true };
  if (total === 0) return { msg: "No images found in this folder", err: true }; // RULE 4
  return { msg: note };
}

async function decideNow(ctx: Ctx, setS: Setter, id: string, decision: Decision): Promise<void> {
  const now = nowIso();
  const items = withDecision(ctx.state.current.items, id, decision, now);
  const next = nextPendingId(items, id);
  setS((p) => ({ ...p, items, counts: tally(items), selectedId: next, toast: next ? null : { msg: "All images reviewed 🎉" } }));
  await persist(ctx, setS, items, now);
}

/** Decisions are the user's work: never dropped, always reported (RULE 2/4). */
async function persist(ctx: Ctx, setS: Setter, items: ReviewItem[], now: string): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  if (ctx.state.current.fileStatus === "corrupt") {
    return void setS((p) => ({ ...p, toast: { msg: "Kept for this session — fix or reset the review file to save it", err: true } }));
  }
  try {
    await flushItems(root, items, now);
    setS((p) => ({ ...p, fileStatus: "ok", fileNote: null }));
  } catch (e) {
    setS((p) => ({ ...p, fileStatus: "write-error", fileNote: `Could not save decisions — ${messageOf(e)}` }));
  }
}

async function retryNow(ctx: Ctx, setS: Setter): Promise<void> {
  if (ctx.state.current.fileStatus === "corrupt") return runScan(ctx, setS);
  await persist(ctx, setS, ctx.state.current.items, nowIso());
}

async function resetNow(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Resetting the review file…" }));
  try {
    const backup = await resetReviewFile(root, ctx.state.current.items, nowIso(), stampName(new Date()));
    setS((p) => ({
      ...p, busy: null, fileStatus: "ok", fileNote: null,
      toast: { msg: backup ? `Review file reset — corrupt copy saved as ${backup}` : "Review file reset" },
    }));
  } catch (e) {
    setS((p) => ({ ...p, busy: null, fileStatus: "write-error", fileNote: `Could not reset the review file — ${messageOf(e)}` }));
  }
}

function stepSelection(ctx: Ctx, setS: Setter, delta: number): void {
  const { items, query, selectedId } = ctx.state.current;
  const view = applyQuery(items, query);
  if (view.length === 0) return;
  const index = view.findIndex((i) => i.id === selectedId);
  setS((p) => ({ ...p, selectedId: view[(index + delta + view.length) % view.length].id }));
}

function openPathNow(ctx: Ctx, setS: Setter, relPath: string): void {
  const full = ctx.root.current ? `${ctx.root.current.name}/${relPath}` : relPath;
  void navigator.clipboard?.writeText(full);
  setS((p) => ({ ...p, toast: { msg: `Path copied: ${full} — browsers cannot open File Explorer, paste it there` } }));
}

async function thumbUrl(ctx: Ctx, relPath: string): Promise<string> {
  const root = ctx.root.current;
  if (!root) throw new Error("No folder selected");
  return URL.createObjectURL(await (await resolveFileHandle(root, relPath)).getFile());
}

function nowIso(): string {
  return new Date().toISOString();
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

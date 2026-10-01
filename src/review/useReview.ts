// useReview.ts — orchestration for the Selection tab (spec §1–§11; RULE 2/4/24).
// Owns: root picking and restore, the scan (manual + watcher), decision updates
// with honest persistence reporting, filters/search, selection, zoom and the
// comparison detail. Everything it drives is separately tested (src/lib/review*,
// ./persist.ts, ./scan.ts, ./useCompare.ts) — this file only wires them to React.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveFileHandle, type DirHandleLike } from "../lib/fs";
import { rescanNote, stampName } from "../lib/reviewformat";
import type { Decision } from "../lib/reviewfile";
import {
  applyDecisions, nextPendingId, orphanRecords, tally, withDecision, type ReviewItem,
} from "../lib/reviewmerge";
import { applyQuery, defaultQuery, mergeQuery, type QueryPatch } from "../lib/reviewquery";
import { diffPairs, type ReviewPair } from "../lib/review";
import { ensurePermission, fsSupported, pickDirectory } from "../batch/picker";
import type { ToastMsg } from "../ui/Overlays";
import { useThumbnails } from "../ui/useThumbnails";
import { flushItems, loadAndSync, resetReviewFile, type FileState } from "./persist";
import { scanRoot, type RootScan } from "./scan";
import { loadReviewRoot, saveReviewRoot } from "./store";
import { useCompare } from "./useCompare";
import type { ReviewApi, ReviewViewState, ScanDelta } from "./api";

interface Ctx {
  root: { current: DirHandleLike | null };
  pairs: { current: ReviewPair[] };
  state: { current: ReviewViewState };
}

type Setter = React.Dispatch<React.SetStateAction<ReviewViewState>>;
type ScanMode = "manual" | "auto" | "silent";

const CLEARED: QueryPatch = { search: "", scope: { mode: "all", month: "", from: "", to: "" }, status: "all" };
const WATCH_MS = 15_000;

export function useReview(): ReviewApi {
  const [s, setS] = useState<ReviewViewState>(initialState);
  const ctx = useCtx(s);
  const scan = useCallback((mode: ScanMode) => { void runScan(ctx, setS, mode); }, [ctx]);
  useEffect(() => { void boot(ctx, setS); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useToastClear(s.toast, setS);
  useWatcher(s, scan);
  const view = useMemo(() => applyQuery(s.items, s.query), [s.items, s.query]);
  const item = view.find((i) => i.id === s.selectedId) ?? s.items.find((i) => i.id === s.selectedId) ?? null;
  const detail = useCompare(ctx.root.current, item);
  const thumbs = useThumbnails(useCallback((relPath: string) => thumbUrl(ctx, relPath), [ctx]));
  useThumbRefresh(thumbs, s.rootName, s.scanAt);
  return { s: { ...s, showing: view.length }, view, item, detail, thumbs, ...useActions(ctx, setS, scan) };
}

function initialState(): ReviewViewState {
  return {
    rootName: "", items: [], orphans: [], counts: tally([]), showing: 0, search: "", scanAt: 0,
    query: defaultQuery(), selectedId: null, busy: null, toast: null, fileStatus: "idle",
    fileNote: null, lastScanAt: null, delta: null, folders: 0, unsaved: 0,
    watcher: true, zoom: "fit", autoNext: true,
  };
}

function useCtx(s: ReviewViewState): Ctx {
  const state = useRef(s);
  state.current = s; // render mirror so async callbacks read live state (RULE 24)
  return { root: useRef(null), pairs: useRef([]), state };
}

function useActions(ctx: Ctx, setS: Setter, scan: (mode: ScanMode) => void): Omit<ReviewApi, "s" | "view" | "item" | "detail" | "thumbs"> {
  return {
    supported: fsSupported(),
    rescan: scan,
    pickRoot: () => { void pickRoot(ctx, setS); },
    decide: (id: string, decision: Decision) => { void decideNow(ctx, setS, id, decision); },
    retry: () => { void retryNow(ctx, setS, scan); },
    resetFile: () => { void resetNow(ctx, setS); },
    openItem: (id: string | null) => setS((p) => ({ ...p, selectedId: id })),
    step: (delta: number) => stepSelection(ctx, setS, delta),
    patch: (patch: QueryPatch) => setS((p) => ({ ...p, query: mergeQuery(p.query, patch), search: patch.search ?? p.search })),
    clearFilters: () => setS((p) => ({ ...p, query: mergeQuery(p.query, CLEARED), search: "" })),
    openPath: (relPath: string) => openPathNow(ctx, setS, relPath),
    toggleWatcher: () => setS((p) => ({ ...p, watcher: !p.watcher })),
    toggleZoom: () => setS((p) => ({ ...p, zoom: p.zoom === "fit" ? "100" : "fit" })),
    setAutoNext: (on: boolean) => setS((p) => ({ ...p, autoNext: on })),
  };
}

function useToastClear(toast: ToastMsg | null, setS: Setter): void {
  useEffect(() => {
    const t = toast ? setTimeout(() => setS((p) => ({ ...p, toast: null })), 5000) : 0;
    return () => clearTimeout(t);
  }, [toast, setS]);
}

/** Thumbnails are re-read after every scan; stale object URLs are revoked. */
function useThumbRefresh(thumbs: ReturnType<typeof useThumbnails>, rootName: string, scanAt: number): void {
  useEffect(() => { thumbs.clear(); }, [rootName, scanAt, thumbs]);
}

/** The watcher re-scans on a slow timer so external changes show up on their own. */
function useWatcher(s: ReviewViewState, scan: (mode: ScanMode) => void): void {
  const active = s.watcher && s.rootName !== "";
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => scan("auto"), WATCH_MS);
    return () => clearInterval(id);
  }, [active, scan]);
}

/** Restores the folder used last time, if the browser still lets us read it. */
async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  try {
    const handle = await loadReviewRoot();
    if (!handle || !(await ensurePermission(handle))) return;
    ctx.root.current = handle;
    setS((p) => ({ ...p, rootName: handle.name }));
    await runScan(ctx, setS, "silent");
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
  await runScan(ctx, setS, "manual");
}

async function runScan(ctx: Ctx, setS: Setter, mode: ScanMode): Promise<void> {
  const root = ctx.root.current;
  if (!root) {
    if (mode === "manual") setS((p) => ({ ...p, toast: { msg: "Choose a folder to review first", err: true } }));
    return;
  }
  setS((p) => ({ ...p, busy: mode === "auto" ? null : "Scanning images…" }));
  try {
    const result = await scanRoot(root);
    const note = rescanNote(ctx.pairs.current, result.pairs);
    const delta = toDelta(diffPairs(ctx.pairs.current, result.pairs));
    ctx.pairs.current = result.pairs;
    const outcome: ScanOutcome = { result, delta, note, state: await loadAndSync(root, result.pairs, nowIso()), mode };
    finishScan(setS, outcome);
  } catch (e) {
    setS((p) => ({ ...p, busy: null, toast: { msg: messageOf(e) || "Scan failed", err: true } }));
  }
}

/** Everything one finished scan produced (grouped, RULE 3 domain type). */
interface ScanOutcome {
  result: RootScan;
  state: FileState;
  delta: ScanDelta;
  note: string;
  mode: ScanMode;
}

/** Mirrors a finished scan into state: list, counters, history and warnings. */
function finishScan(setS: Setter, outcome: ScanOutcome): void {
  const { result, state } = outcome;
  const items = applyDecisions(result.pairs, state.file.records);
  setS((p) => ({
    ...p,
    busy: null,
    items,
    orphans: orphanRecords(state.file.records, result.pairs),
    counts: tally(items),
    folders: result.folders,
    fileStatus: state.status,
    fileNote: state.reason,
    lastScanAt: Date.now(),
    scanAt: p.scanAt + 1,
    delta: outcome.delta,
    selectedId: items.some((i) => i.id === p.selectedId) ? p.selectedId : null,
    toast: scanToast(outcome, items.length),
  }));
}

/** The pair diff the status bar shows (renamed/changed included). */
function toDelta(diff: ReturnType<typeof diffPairs>): ScanDelta {
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    renamed: diff.renamed.length,
    changed: diff.changed.length,
    kept: diff.kept,
  };
}

function scanToast(outcome: ScanOutcome, total: number): ToastMsg | null {
  if (outcome.state.status !== "ok") return { msg: outcome.state.reason ?? outcome.note, err: true };
  if (total === 0) return { msg: "No images found in this folder", err: true }; // RULE 4
  if (outcome.mode === "auto" && outcome.delta.added + outcome.delta.removed === 0) return null;
  const prefix = outcome.mode === "auto" ? "Watched folder changed — " : "";
  return { msg: `${prefix}${outcome.note}` };
}

async function decideNow(ctx: Ctx, setS: Setter, id: string, decision: Decision): Promise<void> {
  const now = nowIso();
  const items = withDecision(ctx.state.current.items, id, decision, now);
  const auto = ctx.state.current.autoNext;
  const next = auto ? nextPendingId(items, id) : id;
  setS((p) => ({ ...p, items, counts: tally(items), selectedId: next, toast: next ? null : { msg: "All images reviewed 🎉" } }));
  await persist(ctx, setS, items, now);
}

/** Decisions are the user's work: never dropped, always reported (RULE 2/4). */
async function persist(ctx: Ctx, setS: Setter, items: ReviewItem[], now: string): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  if (ctx.state.current.fileStatus === "corrupt") {
    return void setS((p) => ({ ...p, unsaved: p.unsaved + 1, toast: { msg: "Kept for this session — fix or reset the review file to save it", err: true } }));
  }
  try {
    await flushItems(root, items, now);
    setS((p) => ({ ...p, fileStatus: "ok", fileNote: null, unsaved: 0 }));
  } catch (e) {
    setS((p) => ({ ...p, fileStatus: "write-error", fileNote: `Could not save decisions — ${messageOf(e)}`, unsaved: p.unsaved + 1 }));
  }
}

async function retryNow(ctx: Ctx, setS: Setter, scan: (mode: ScanMode) => void): Promise<void> {
  if (ctx.state.current.fileStatus === "corrupt") return scan("manual");
  await persist(ctx, setS, ctx.state.current.items, nowIso());
}

async function resetNow(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Resetting the review file…" }));
  try {
    const backup = await resetReviewFile(root, ctx.state.current.items, nowIso(), stampName(new Date()));
    setS((p) => ({
      ...p, busy: null, fileStatus: "ok", fileNote: null, unsaved: 0,
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
  const full = ctx.root.current ? `${ctx.root.current.name}\\${relPath.split("/").join("\\")}` : relPath;
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

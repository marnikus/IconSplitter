// useBatchPreview.ts — high-perf preview for Batch (1000 images) + immediate per-row preview on Apply/Reset + progress bar + persistence per root + regenerate
// ideal-size: 295 lines reason=high-perf preview owns cache, load, thumb render, queue, abort and single-row immediate preview; splitting would break cohesion, still under 320
import { useCallback, useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { analyzeAsync, detectAsync, type Analysis, type Box } from "../lib/detect";
import { renderIcon, squareInfo } from "../lib/render";
import { loadImageFile } from "../lib/dom";
import { previewKey } from "../lib/batchpreview";
import type { SplitSettings } from "../lib/presets";
import type { Row, RowMergeMap } from "./useBatch";
import { makeBatchProgress, type BatchProgress } from "./BatchProgress";
import { yieldToFrame, yieldToUI } from "../lib/yield";
import { idbPut, idbGetAll, idbClear, idbGetAllKeys, idbDelete, PREVIEW_STORE } from "./store";
export interface PreviewEntry { relPath: string; count: number; thumbs: string[]; boxes: Box[]; status: "idle" | "loading" | "done" | "error"; error?: string; rootName?: string; }
type LoadFile = (relPath: string) => Promise<File>;
const MAX_CONCURRENT = 3;
const MAX_THUMBS = 20;
const THUMB_OUT = 96;
const CACHE_LIMIT = 200;
interface CacheItem { key: string; entry: PreviewEntry; at: number; }
function useCaches() {
  const analysis = useRef<Map<string, Analysis>>(new Map());
  const lru = useRef<Map<string, CacheItem>>(new Map());
  return { analysis, lru };
}
function usePreviewState() {
  const [previews, setPreviews] = useState<Map<string, PreviewEntry>>(new Map());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  return { previews, setPreviews, isPreviewing, setIsPreviewing, progress, setProgress, running, setRunning, abortRef };
}
function useLoadFile(root: DirHandleLike | null, custom?: LoadFile) {
  return useCallback(async (relPath: string): Promise<File> => {
    if (custom) return custom(relPath);
    if (!root) throw new Error("No root");
    const idx = relPath.lastIndexOf("/");
    const dirPath = idx < 0 ? "" : relPath.slice(0, idx);
    const fileName = idx < 0 ? relPath : relPath.slice(idx + 1);
    let cur: DirHandleLike = root;
    if (dirPath) for (const part of dirPath.split("/")) cur = await cur.getDirectoryHandle(part, { create: false });
    const fh = await cur.getFileHandle(fileName, { create: false });
    return fh.getFile();
  }, [root, custom]);
}
function savePersisted(rootName: string, entry: PreviewEntry) {
  const key = `${rootName || "default"}::${entry.relPath}`;
  void idbPut(PREVIEW_STORE, key, { ...entry, rootName });
}
function matchesRoot(key: string, entry: PreviewEntry, rootName: string): boolean {
  if (key.startsWith(`${rootName}::`)) return true;
  if ((entry as any).rootName === rootName) return true;
  if (!key.includes("::") && !(entry as any).rootName) return true;
  return false;
}
async function loadPersisted(rootName?: string): Promise<Map<string, PreviewEntry>> {
  try {
    const keys = await idbGetAllKeys(PREVIEW_STORE);
    const vals = await idbGetAll<PreviewEntry>(PREVIEW_STORE);
    const m = new Map<string, PreviewEntry>();
    for (let i = 0; i < vals.length; i++) {
      const e = vals[i]; const k = keys[i] || "";
      if (!e || !e.relPath) continue;
      if (rootName && !matchesRoot(k, e, rootName)) continue;
      m.set(e.relPath, e);
    }
    return m;
  } catch { return new Map(); }
}
async function clearPersisted(rootName?: string): Promise<void> {
  try {
    if (!rootName) { await idbClear(PREVIEW_STORE); return; }
    const keys = await idbGetAllKeys(PREVIEW_STORE);
    const prefix = `${rootName}::`;
    for (const k of keys) if (k.startsWith(prefix)) await idbDelete(PREVIEW_STORE, k);
  } catch { /* ignore */ }
}
function makeFallback(relPath: string, rootName?: string): PreviewEntry { return { relPath, count: 1, thumbs: [], boxes: [{ x: 0, y: 0, w: 100, h: 100, ink: 1 }], status: "done", rootName }; }
function evictMap(map: Map<string, unknown>) { if (map.size > CACHE_LIMIT) { const first = map.keys().next().value; if (first) map.delete(first); } }
function evictLru(lru: Map<string, CacheItem>) {
  if (lru.size <= CACHE_LIMIT) return;
  const oldest = [...lru.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
  if (oldest) lru.delete(oldest);
}
function renderThumbsYielding(img: HTMLImageElement, an: Analysis, boxes: Box[], split: SplitSettings): Promise<string[]> {
  return (async () => {
    const sq = squareInfo(boxes, split.padding);
    const opts = { padding: split.padding, size: split.size, transparent: split.transparent };
    const out: string[] = [];
    const limit = Math.min(boxes.length, MAX_THUMBS);
    for (let i = 0; i < limit; i++) {
      const canvas = renderIcon(img, an, boxes, boxes[i], sq, opts, THUMB_OUT);
      out.push(canvas.toDataURL("image/png"));
      if (i % 2 === 0) await yieldToUI();
    }
    return out;
  })();
}
async function loadImgSafe(file: File): Promise<HTMLImageElement | null> { try { return await loadImageFile(file); } catch { return null; } }
async function getOrAnalyze(img: HTMLImageElement, relPath: string, cache: Map<string, Analysis>): Promise<Analysis> {
  let an = cache.get(relPath);
  if (!an) { an = await analyzeAsync(img); cache.set(relPath, an); evictMap(cache); }
  return an;
}
function buildEntry(relPath: string, boxes: Box[], thumbs: string[], rootName?: string): PreviewEntry { return { relPath, count: boxes.length, thumbs, boxes, status: "done", rootName }; }
export function effectiveMerge(global: number | null, override: number | null | undefined, hasOverride: boolean): number | null { return hasOverride ? (override as number | null) : global; }
function useDoPreviewCore(args: { split: SplitSettings; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; rootName: string; }) {
  const { split, loadFile, analysis, lru, rootName } = args;
  return useCallback(async (row: Row, eff: number | null, signal: AbortSignal, key: string): Promise<PreviewEntry> => {
    const file = await loadFile(row.relPath);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    await yieldToUI();
    const img = await loadImgSafe(file);
    if (!img) { const fb = makeFallback(row.relPath, rootName); lru.current.set(row.relPath, { key, entry: fb, at: Date.now() }); savePersisted(rootName, fb); return fb; }
    const an = await getOrAnalyze(img, row.relPath, analysis.current);
    await yieldToUI();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const boxes = (await detectAsync(an, eff)).boxes;
    await yieldToUI();
    const thumbs = await renderThumbsYielding(img, an, boxes, { ...split, mergeFrac: eff });
    const entry = buildEntry(row.relPath, boxes, thumbs, rootName);
    lru.current.set(row.relPath, { key, entry, at: Date.now() }); evictLru(lru.current);
    savePersisted(rootName, entry);
    return entry;
  }, [split, loadFile, analysis, lru, rootName]);
}
function useDoPreview(args: { split: SplitSettings; rowMerges: RowMergeMap; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; rootName: string; }) {
  const core = useDoPreviewCore({ split: args.split, loadFile: args.loadFile, analysis: args.analysis, lru: args.lru, rootName: args.rootName });
  const { split, rowMerges } = args;
  return useCallback(async (row: Row, signal: AbortSignal, key: string): Promise<PreviewEntry> => {
    const lk = row.relPath.toLowerCase();
    const hasOv = Object.prototype.hasOwnProperty.call(rowMerges, lk);
    const eff = effectiveMerge(split.mergeFrac, rowMerges[lk], hasOv);
    return core(row, eff, signal, key);
  }, [split, rowMerges, core]);
}
function usePreviewOne(args: { split: SplitSettings; rowMerges: RowMergeMap; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; rootName: string; }) {
  const doPreview = useDoPreview(args);
  const core = useDoPreviewCore({ split: args.split, loadFile: args.loadFile, analysis: args.analysis, lru: args.lru, rootName: args.rootName });
  const { split, rowMerges, lru } = args;
  return useCallback(async (row: Row, signal: AbortSignal, overrideFrac?: number | null): Promise<PreviewEntry> => {
    const lk = row.relPath.toLowerCase();
    const hasOv = Object.prototype.hasOwnProperty.call(rowMerges, lk);
    const eff = overrideFrac !== undefined ? overrideFrac : effectiveMerge(split.mergeFrac, rowMerges[lk], hasOv);
    const key = previewKey({ relPath: row.relPath, mergeFrac: eff, padding: split.padding, size: split.size, transparent: split.transparent, mtime: row.mtime });
    const cached = lru.current.get(row.relPath);
    if (cached && cached.key === key) return cached.entry;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      if (overrideFrac !== undefined) return await core(row, eff, signal, key);
      return await doPreview(row, signal, key);
    } catch (e) { if ((e as Error).name === "AbortError") throw e; return { relPath: row.relPath, count: 0, thumbs: [], boxes: [], status: "error", error: (e as Error).message }; }
  }, [split, rowMerges, lru, doPreview, core]);
}
function markLoading(eligible: Row[], setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>) {
  setPreviews((prev) => { const next = new Map(prev); for (const r of eligible) next.set(r.relPath, { relPath: r.relPath, count: 0, thumbs: [], boxes: [], status: "loading" }); return next; });
}
type WorkersArgs = { queue: Row[]; ac: AbortController; previewOne: (row: Row, signal: AbortSignal) => Promise<PreviewEntry>; setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>; onProgress?: (done: number, current: Row | null) => void; onReviewed?: (relPath: string, count: number) => void; };
async function runWorkers(args: WorkersArgs) {
  const { queue, ac, previewOne, setPreviews, onProgress, onReviewed } = args;
  let idx = 0, done = 0;
  const runNext = async () => {
    while (idx < queue.length) {
      if (ac.signal.aborted) return;
      await yieldToFrame();
      const row = queue[idx++];
      try {
        const entry = await previewOne(row, ac.signal);
        if (ac.signal.aborted) return;
        setPreviews((prev) => { const next = new Map(prev); next.set(row.relPath, entry); return next; });
        onReviewed?.(row.relPath, entry.count);
        done++; onProgress?.(done, queue[done] ?? null);
      } catch { return; }
      await yieldToUI();
    }
  };
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => runNext());
  await Promise.all(workers);
}
function makeRunId(): string { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function initPreviewProgress(eligible: Row[]): BatchProgress {
  const runId = makeRunId();
  const init = makeBatchProgress(eligible.length, runId);
  init.currentRelPath = eligible[0]?.relPath ?? null;
  init.currentName = eligible[0]?.name ?? "";
  return init;
}
function makePreviewProgressUpdater(setProgress: React.Dispatch<React.SetStateAction<BatchProgress | null>>) {
  return (done: number, current: Row | null) => {
    setProgress((prev) => {
      if (!prev) return prev;
      return { ...prev, done, currentRelPath: current?.relPath ?? prev.currentRelPath, currentName: current?.name ?? prev.currentName, saved: done };
    });
  };
}
function usePreviewQueue(args: { previewOne: (row: Row, signal: AbortSignal) => Promise<PreviewEntry>; setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>; setIsPreviewing: React.Dispatch<React.SetStateAction<boolean>>; setProgress: React.Dispatch<React.SetStateAction<BatchProgress | null>>; setRunning: React.Dispatch<React.SetStateAction<boolean>>; abortRef: React.MutableRefObject<AbortController | null>; onReviewed?: (relPath: string, count: number) => void; previews: Map<string, PreviewEntry>; }) {
  const { previewOne, setPreviews, setIsPreviewing, setProgress, setRunning, abortRef, onReviewed, previews } = args;
  return useCallback(async (selected: Row[], force = false) => {
    const base = selected.filter((r) => r.status !== "missing" && r.status !== "deleted");
    const eligible = force ? base : base.filter((r) => { const e = previews.get(r.relPath); return !e || e.status !== "done"; });
    if (eligible.length === 0) return;
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const init = initPreviewProgress(eligible);
    setProgress(init); setRunning(true); setIsPreviewing(true);
    markLoading(eligible, setPreviews);
    const onProgress = makePreviewProgressUpdater(setProgress);
    await runWorkers({ queue: [...eligible], ac, previewOne, setPreviews, onProgress, onReviewed });
    if (!ac.signal.aborted) { setIsPreviewing(false); setRunning(false); }
  }, [previewOne, abortRef, setPreviews, setIsPreviewing, setProgress, setRunning, onReviewed, previews]);
}
function usePreviewSingle(previewOne: (row: Row, signal: AbortSignal, overrideFrac?: number | null) => Promise<PreviewEntry>, setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>, onReviewed?: (relPath: string, count: number) => void) {
  return useCallback(async (row: Row, overrideFrac?: number | null) => {
    setPreviews((prev) => { const next = new Map(prev); next.set(row.relPath, { relPath: row.relPath, count: 0, thumbs: [], boxes: [], status: "loading" }); return next; });
    try {
      const ac = new AbortController();
      const entry = overrideFrac !== undefined ? await previewOne(row, ac.signal, overrideFrac) : await previewOne(row, ac.signal);
      setPreviews((prev) => { const next = new Map(prev); next.set(row.relPath, entry); return next; });
      onReviewed?.(row.relPath, entry.count);
    } catch { /* ignore */ }
  }, [previewOne, setPreviews, onReviewed]);
}
function useRootChange(root: DirHandleLike | null, clearMemory: () => void) {
  const prevRef = useRef<DirHandleLike | null>(null);
  useEffect(() => {
    if (prevRef.current === null && root !== null) { prevRef.current = root; return; }
    if (prevRef.current !== root) { clearMemory(); prevRef.current = root; }
  }, [root, clearMemory]);
}
function usePersistedLoad(rootName: string, setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>, onReviewed?: (relPath: string, count: number) => void, onReviewedBatch?: (entries: { relPath: string; count: number }[]) => void) {
  useEffect(() => {
    if (!rootName) return;
    void (async () => {
      const loaded = await loadPersisted(rootName);
      if (loaded.size === 0) return;
      setPreviews((prev) => { if (prev.size > 0) { const merged = new Map(prev); for (const [k, v] of loaded) if (!merged.has(k)) merged.set(k, v); return merged; } return loaded; });
      const batch = [...loaded.values()].map((e) => ({ relPath: e.relPath, count: e.count }));
      if (onReviewedBatch) onReviewedBatch(batch);
      else for (const e of loaded.values()) onReviewed?.(e.relPath, e.count);
    })();
  }, [rootName, setPreviews, onReviewed, onReviewedBatch]);
}
function buildRowMap(rows: Row[]): Map<string, Row> { const m = new Map<string, Row>(); for (const r of rows) m.set(r.relPath.toLowerCase(), r); return m; }
function shouldSync(row: Row | undefined, count: number): boolean {
  if (!row) return false;
  if (row.review === "declined") return false;
  const exp = count === 4 ? "approved" : "warning";
  return row.review !== exp;
}
function collectSync(rows: Row[], previews: Map<string, PreviewEntry>, seen: Set<string>): { relPath: string; count: number }[] {
  const rowMap = buildRowMap(rows);
  const out: { relPath: string; count: number }[] = [];
  for (const entry of previews.values()) {
    const k = entry.relPath + "|" + entry.count;
    if (seen.has(k)) continue;
    const row = rowMap.get(entry.relPath.toLowerCase());
    if (shouldSync(row, entry.count)) out.push({ relPath: entry.relPath, count: entry.count });
  }
  return out;
}
function markSeen(list: { relPath: string; count: number }[], seen: Set<string>) { for (const e of list) seen.add(e.relPath + "|" + e.count); }
function useReviewSync(rows: Row[], previews: Map<string, PreviewEntry>, onReviewed?: (relPath: string, count: number) => void, onReviewedBatch?: (entries: { relPath: string; count: number }[]) => void) {
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!rows.length || !previews.size) return;
    const list = collectSync(rows, previews, seen.current);
    if (list.length === 0) return;
    markSeen(list, seen.current);
    if (onReviewedBatch) onReviewedBatch(list);
    else for (const e of list) onReviewed?.(e.relPath, e.count);
  }, [rows, previews, onReviewed, onReviewedBatch]);
}
export function useBatchPreview(params: { root: DirHandleLike | null; rootName?: string; rows: Row[]; split: SplitSettings; rowMerges?: RowMergeMap; loadFile?: LoadFile; onReviewed?: (relPath: string, count: number) => void; onReviewedBatch?: (entries: { relPath: string; count: number }[]) => void; }) {
  const { root, rootName, split, rowMerges, onReviewed, onReviewedBatch } = params;
  const rName = rootName || (root as any)?.name || "default";
  const merges = rowMerges ?? {};
  const { analysis, lru } = useCaches();
  const { previews, setPreviews, isPreviewing, setIsPreviewing, progress, setProgress, running, setRunning, abortRef } = usePreviewState();
  const loadFile = useLoadFile(root, params.loadFile);
  const previewOne = usePreviewOne({ split, rowMerges: merges, loadFile, analysis, lru, rootName: rName });
  const previewSelected = usePreviewQueue({ previewOne, setPreviews, setIsPreviewing, setProgress, setRunning, abortRef, onReviewed, previews });
  const previewSingle = usePreviewSingle(previewOne, setPreviews, onReviewed);
  const clear = useCallback(() => { abortRef.current?.abort(); setPreviews(new Map()); setIsPreviewing(false); setProgress(null); setRunning(false); void clearPersisted(rName); }, [abortRef, setPreviews, setIsPreviewing, setProgress, setRunning, rName]);
  const clearMemory = useCallback(() => { abortRef.current?.abort(); setPreviews(new Map()); setIsPreviewing(false); setProgress(null); setRunning(false); }, [abortRef, setPreviews, setIsPreviewing, setProgress, setRunning]);
  const cancel = useCallback(() => { abortRef.current?.abort(); setIsPreviewing(false); setRunning(false); }, [abortRef, setIsPreviewing, setRunning]);
  const dismiss = useCallback(() => { setProgress(null); }, [setProgress]);
  useRootChange(root, clearMemory);
  usePersistedLoad(rName, setPreviews, onReviewed, onReviewedBatch);
  useReviewSync(params.rows, previews, onReviewed, onReviewedBatch);
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, [abortRef]);
  return { previews, isPreviewing, previewSelected, clear, previewOne, previewSingle, progress, running, cancel, dismiss };
}

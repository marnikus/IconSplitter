// useBatchPreview.ts — high-perf preview for Batch (1000 images) + immediate per-row preview on Apply/Reset + progress bar
// ideal-size: 303 lines reason=high-perf preview owns cache, load, thumb render, queue, abort and single-row immediate preview; splitting would break cohesion, still under 320 with 35 fns each ≤30 lines

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { analyze, detect, type Analysis, type Box } from "../lib/detect";
import { renderIcon, squareInfo } from "../lib/render";
import { loadImageFile } from "../lib/dom";
import { previewKey } from "../lib/batchpreview";
import type { SplitSettings } from "../lib/presets";
import type { Row, RowMergeMap } from "./useBatch";
import { makeBatchProgress, type BatchProgress } from "./BatchProgress";
import { yieldToFrame, yieldToUI } from "../lib/yield";

export interface PreviewEntry {
  relPath: string;
  count: number;
  thumbs: string[];
  boxes: Box[];
  status: "idle" | "loading" | "done" | "error";
  error?: string;
}

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
function makeFallback(relPath: string): PreviewEntry {
  return { relPath, count: 1, thumbs: [], boxes: [{ x: 0, y: 0, w: 100, h: 100, ink: 1 }], status: "done" };
}
function evictMap(map: Map<string, unknown>) {
  if (map.size > CACHE_LIMIT) { const first = map.keys().next().value; if (first) map.delete(first); }
}
function evictLru(lru: Map<string, CacheItem>) {
  if (lru.size <= CACHE_LIMIT) return;
  const oldest = [...lru.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
  if (oldest) lru.delete(oldest);
}
function renderThumbs(img: HTMLImageElement, an: Analysis, boxes: Box[], split: SplitSettings): string[] {
  const sq = squareInfo(boxes, split.padding);
  const opts = { padding: split.padding, size: split.size, transparent: split.transparent };
  const out: string[] = [];
  const limit = Math.min(boxes.length, MAX_THUMBS);
  for (let i = 0; i < limit; i++) { const canvas = renderIcon(img, an, boxes, boxes[i], sq, opts, THUMB_OUT); out.push(canvas.toDataURL("image/png")); }
  return out;
}
async function renderThumbsYielding(img: HTMLImageElement, an: Analysis, boxes: Box[], split: SplitSettings): Promise<string[]> {
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
}
async function loadImgSafe(file: File): Promise<HTMLImageElement | null> {
  try { return await loadImageFile(file); } catch { return null; }
}
function getOrAnalyze(img: HTMLImageElement, relPath: string, cache: Map<string, Analysis>): Analysis {
  let an = cache.get(relPath);
  if (!an) { an = analyze(img); cache.set(relPath, an); evictMap(cache); }
  return an;
}
function buildEntry(relPath: string, boxes: Box[], thumbs: string[]): PreviewEntry {
  return { relPath, count: boxes.length, thumbs, boxes, status: "done" };
}
export function effectiveMerge(global: number | null, override: number | null | undefined, hasOverride: boolean): number | null {
  return hasOverride ? (override as number | null) : global;
}
function useDoPreviewCore(args: { split: SplitSettings; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; }) {
  const { split, loadFile, analysis, lru } = args;
  return useCallback(async (row: Row, eff: number | null, signal: AbortSignal, key: string): Promise<PreviewEntry> => {
    const file = await loadFile(row.relPath);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    await yieldToUI();
    const img = await loadImgSafe(file);
    if (!img) { const fb = makeFallback(row.relPath); lru.current.set(row.relPath, { key, entry: fb, at: Date.now() }); return fb; }
    const an = getOrAnalyze(img, row.relPath, analysis.current);
    await yieldToUI();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const boxes = detect(an, eff).boxes;
    await yieldToUI();
    const thumbs = await renderThumbsYielding(img, an, boxes, { ...split, mergeFrac: eff });
    const entry = buildEntry(row.relPath, boxes, thumbs);
    lru.current.set(row.relPath, { key, entry, at: Date.now() }); evictLru(lru.current);
    return entry;
  }, [split, loadFile, analysis, lru]);
}
function useDoPreview(args: { split: SplitSettings; rowMerges: RowMergeMap; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; }) {
  const core = useDoPreviewCore({ split: args.split, loadFile: args.loadFile, analysis: args.analysis, lru: args.lru });
  const { split, rowMerges } = args;
  return useCallback(async (row: Row, signal: AbortSignal, key: string): Promise<PreviewEntry> => {
    const lk = row.relPath.toLowerCase();
    const hasOv = Object.prototype.hasOwnProperty.call(rowMerges, lk);
    const eff = effectiveMerge(split.mergeFrac, rowMerges[lk], hasOv);
    return core(row, eff, signal, key);
  }, [split, rowMerges, core]);
}
function usePreviewOne(args: { split: SplitSettings; rowMerges: RowMergeMap; loadFile: LoadFile; analysis: React.MutableRefObject<Map<string, Analysis>>; lru: React.MutableRefObject<Map<string, CacheItem>>; }) {
  const doPreview = useDoPreview(args);
  const core = useDoPreviewCore({ split: args.split, loadFile: args.loadFile, analysis: args.analysis, lru: args.lru });
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
type WorkersArgs = {
  queue: Row[];
  ac: AbortController;
  previewOne: (row: Row, signal: AbortSignal) => Promise<PreviewEntry>;
  setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>;
  onProgress?: (done: number, current: Row | null) => void;
};

async function runWorkers(args: WorkersArgs) {
  const { queue, ac, previewOne, setPreviews, onProgress } = args;
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
        done++;
        onProgress?.(done, queue[done] ?? null);
      } catch { return; }
      await yieldToUI();
    }
  };
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => runNext());
  await Promise.all(workers);
}
function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
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
      return {
        ...prev,
        done,
        currentRelPath: current?.relPath ?? prev.currentRelPath,
        currentName: current?.name ?? prev.currentName,
        saved: done,
      };
    });
  };
}

function usePreviewQueue(args: {
  previewOne: (row: Row, signal: AbortSignal) => Promise<PreviewEntry>;
  setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>;
  setIsPreviewing: React.Dispatch<React.SetStateAction<boolean>>;
  setProgress: React.Dispatch<React.SetStateAction<BatchProgress | null>>;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  abortRef: React.MutableRefObject<AbortController | null>;
}) {
  const { previewOne, setPreviews, setIsPreviewing, setProgress, setRunning, abortRef } = args;
  return useCallback(async (selected: Row[]) => {
    const eligible = selected.filter((r) => r.status !== "missing" && r.status !== "deleted");
    if (eligible.length === 0) return;
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const init = initPreviewProgress(eligible);
    setProgress(init);
    setRunning(true);
    setIsPreviewing(true);
    markLoading(eligible, setPreviews);
    const onProgress = makePreviewProgressUpdater(setProgress);
    await runWorkers({ queue: [...eligible], ac, previewOne, setPreviews, onProgress });
    if (!ac.signal.aborted) {
      setIsPreviewing(false);
      setRunning(false);
    }
  }, [previewOne, abortRef, setPreviews, setIsPreviewing, setProgress, setRunning]);
}
function usePreviewSingle(previewOne: (row: Row, signal: AbortSignal, overrideFrac?: number | null) => Promise<PreviewEntry>, setPreviews: React.Dispatch<React.SetStateAction<Map<string, PreviewEntry>>>) {
  return useCallback(async (row: Row, overrideFrac?: number | null) => {
    setPreviews((prev) => { const next = new Map(prev); next.set(row.relPath, { relPath: row.relPath, count: 0, thumbs: [], boxes: [], status: "loading" }); return next; });
    try {
      const ac = new AbortController();
      const entry = overrideFrac !== undefined ? await previewOne(row, ac.signal, overrideFrac) : await previewOne(row, ac.signal);
      setPreviews((prev) => { const next = new Map(prev); next.set(row.relPath, entry); return next; });
    } catch { /* ignore */ }
  }, [previewOne, setPreviews]);
}
export function useBatchPreview(params: { root: DirHandleLike | null; rows: Row[]; split: SplitSettings; rowMerges?: RowMergeMap; loadFile?: LoadFile; }) {
  const { root, split, rowMerges } = params;
  const merges = rowMerges ?? {};
  const { analysis, lru } = useCaches();
  const { previews, setPreviews, isPreviewing, setIsPreviewing, progress, setProgress, running, setRunning, abortRef } = usePreviewState();
  const loadFile = useLoadFile(root, params.loadFile);
  const previewOne = usePreviewOne({ split, rowMerges: merges, loadFile, analysis, lru });
  const previewSelected = usePreviewQueue({ previewOne, setPreviews, setIsPreviewing, setProgress, setRunning, abortRef });
  const previewSingle = usePreviewSingle(previewOne, setPreviews);
  const clear = useCallback(() => { abortRef.current?.abort(); setPreviews(new Map()); setIsPreviewing(false); setProgress(null); setRunning(false); }, [abortRef, setPreviews, setIsPreviewing, setProgress, setRunning]);
  const cancel = useCallback(() => { abortRef.current?.abort(); setIsPreviewing(false); setRunning(false); }, [abortRef, setIsPreviewing, setRunning]);
  const dismiss = useCallback(() => { setProgress(null); }, [setProgress]);
  useEffect(() => { clear(); }, [root, clear]);
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, [abortRef]);
  return { previews, isPreviewing, previewSelected, clear, previewOne, previewSingle, progress, running, cancel, dismiss };
}

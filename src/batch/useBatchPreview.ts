// useBatchPreview.ts — preview for Batch rows: caches, source loading and thumbnails,
// plus the two ways in — the multi-row run (previewqueue.ts) and the single row the
// user just tuned on its own Detection bar (Apply/Reset), which is previewed with the
// distance that click carried, at once and without touching any other row (2026-10-13).
// ideal-size: 250 lines reason=one preview entry (analysis cache, LRU, source load,
// 20 thumbs) and its two callers; the multi-row run moved out to previewqueue.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { analyze, detect, type Analysis, type Box } from "../lib/detect";
import { renderIcon, squareInfo } from "../lib/render";
import { loadImageFile } from "../lib/dom";
import { mergeForRow, previewKey } from "../lib/batchpreview";
import type { SplitSettings } from "../lib/presets";
import type { PreviewEntry, PreviewOne, PreviewSet, Row, RowMergeMap } from "./useBatchTypes";
import { markLoading, runPreviewRows, setEntry, useOwnRows, usePreviewQueue, type OwnRows } from "./previewqueue";

type LoadFile = (relPath: string) => Promise<File>;

const MAX_THUMBS = 20;
const THUMB_OUT = 96;
const CACHE_LIMIT = 200;
/** One identity for "no overrides at all" — a fresh `{}` per render would re-run effects. */
const NO_OVERRIDES: RowMergeMap = {};

interface CacheItem {
  key: string;
  entry: PreviewEntry;
  at: number;
}

function useCaches() {
  const analysis = useRef<Map<string, Analysis>>(new Map());
  const lru = useRef<Map<string, CacheItem>>(new Map());
  return { analysis, lru };
}

function usePreviewState() {
  const [previews, setPreviews] = useState<Map<string, PreviewEntry>>(new Map());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  return { previews, setPreviews, isPreviewing, setIsPreviewing, abortRef };
}

function useLoadFile(root: DirHandleLike | null, custom?: LoadFile) {
  return useCallback(
    async (relPath: string): Promise<File> => {
      if (custom) return custom(relPath);
      if (!root) throw new Error("No root");
      const idx = relPath.lastIndexOf("/");
      const dirPath = idx < 0 ? "" : relPath.slice(0, idx);
      const fileName = idx < 0 ? relPath : relPath.slice(idx + 1);
      let cur: DirHandleLike = root;
      if (dirPath) {
        for (const part of dirPath.split("/")) {
          cur = await cur.getDirectoryHandle(part, { create: false });
        }
      }
      const fh = await cur.getFileHandle(fileName, { create: false });
      return fh.getFile();
    },
    [root, custom],
  );
}

function makeFallback(relPath: string): PreviewEntry {
  return {
    relPath,
    count: 1,
    thumbs: [],
    boxes: [{ x: 0, y: 0, w: 100, h: 100, ink: 1 }],
    status: "done",
  };
}

function evictMap(map: Map<string, unknown>) {
  if (map.size > CACHE_LIMIT) {
    const first = map.keys().next().value;
    if (first) map.delete(first);
  }
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
  for (let i = 0; i < limit; i++) {
    const canvas = renderIcon(img, an, boxes, boxes[i], sq, opts, THUMB_OUT);
    out.push(canvas.toDataURL("image/png"));
  }
  return out;
}

async function loadImgSafe(file: File): Promise<HTMLImageElement | null> {
  try {
    return await loadImageFile(file);
  } catch {
    return null;
  }
}

function getOrAnalyze(img: HTMLImageElement, relPath: string, cache: Map<string, Analysis>): Analysis {
  let an = cache.get(relPath);
  if (!an) {
    an = analyze(img);
    cache.set(relPath, an);
    evictMap(cache);
  }
  return an;
}

function buildEntry(relPath: string, boxes: Box[], thumbs: string[]): PreviewEntry {
  return { relPath, count: boxes.length, thumbs, boxes, status: "done" };
}

/** Stores the entry under the key it was computed with and answers it back. */
function remember(lru: Map<string, CacheItem>, relPath: string, key: string, entry: PreviewEntry): PreviewEntry {
  lru.set(relPath, { key, entry, at: Date.now() });
  evictLru(lru);
  return entry;
}

function entryKey(row: Row, split: SplitSettings, mergeFrac: number | null): string {
  return previewKey({
    relPath: row.relPath,
    mergeFrac,
    padding: split.padding,
    size: split.size,
    transparent: split.transparent,
    mtime: row.mtime,
  });
}

interface PreviewArgs {
  split: SplitSettings;
  rowMerges: RowMergeMap;
  loadFile: LoadFile;
  analysis: React.MutableRefObject<Map<string, Analysis>>;
  lru: React.MutableRefObject<Map<string, CacheItem>>;
}

function useDoPreview(args: PreviewArgs) {
  const { split, loadFile, analysis, lru } = args;
  return useCallback(
    async (row: Row, signal: AbortSignal, mergeFrac: number | null, key: string): Promise<PreviewEntry> => {
      const file = await loadFile(row.relPath);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const img = await loadImgSafe(file);
      if (!img) return remember(lru.current, row.relPath, key, makeFallback(row.relPath));
      const an = getOrAnalyze(img, row.relPath, analysis.current);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const boxes = detect(an, mergeFrac).boxes;
      const thumbs = renderThumbs(img, an, boxes, { ...split, mergeFrac });
      return remember(lru.current, row.relPath, key, buildEntry(row.relPath, boxes, thumbs));
    },
    [split, loadFile, analysis, lru],
  );
}

function usePreviewOne(args: PreviewArgs) {
  const doPreview = useDoPreview(args);
  const { split, rowMerges, lru } = args;
  return useCallback<PreviewOne>(
    async (row, signal, explicitMerge) => {
      const mergeFrac = mergeForRow(split.mergeFrac, rowMerges, row.relPath, explicitMerge);
      const key = entryKey(row, split, mergeFrac);
      const cached = lru.current.get(row.relPath);
      if (cached && cached.key === key) return cached.entry;
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        return await doPreview(row, signal, mergeFrac, key);
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        return { relPath: row.relPath, count: 0, thumbs: [], boxes: [], status: "error", error: (e as Error).message };
      }
    },
    [split, rowMerges, lru, doPreview],
  );
}

interface RowPreviewArgs {
  previewOne: PreviewOne;
  setPreviews: PreviewSet;
  own: OwnRows;
}

/** Apply / Reset on a row's own bar: that row alone, at the distance the click carried. */
function useRowPreview(args: RowPreviewArgs) {
  const { previewOne, setPreviews, own } = args;
  const abortRef = useRef<AbortController | null>(null);
  const previewRow = useCallback(
    (row: Row, mergeFrac: number | null) => {
      own.claim(row.relPath); // the multi-row run must not repaint this row
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      markLoading([row], setPreviews);
      const one = (r: Row, signal: AbortSignal) => previewOne(r, signal, mergeFrac);
      const write = (entry: PreviewEntry) => setEntry(setPreviews, entry);
      return runPreviewRows({ rows: [row], ac, previewOne: one, write });
    },
    [previewOne, setPreviews, own],
  );
  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { previewRow, cancel };
}

export interface BatchPreviewApi {
  previews: Map<string, PreviewEntry>;
  isPreviewing: boolean;
  previewSelected: (rows: Row[]) => Promise<void>;
  previewRow: (row: Row, mergeFrac: number | null) => Promise<void>;
  clear: () => void;
}

export function useBatchPreview(params: {
  root: DirHandleLike | null;
  rows: Row[];
  split: SplitSettings;
  rowMerges?: RowMergeMap;
  loadFile?: LoadFile;
}): BatchPreviewApi {
  const { root, split } = params;
  const merges = params.rowMerges ?? NO_OVERRIDES;
  const own = useOwnRows();
  const { analysis, lru } = useCaches();
  const { previews, setPreviews, isPreviewing, setIsPreviewing, abortRef } = usePreviewState();
  const loadFile = useLoadFile(root, params.loadFile);
  const previewOne = usePreviewOne({ split, rowMerges: merges, loadFile, analysis, lru });
  const previewSelected = usePreviewQueue({ previewOne, setPreviews, setIsPreviewing, abortRef, own });
  const { previewRow, cancel } = useRowPreview({ previewOne, setPreviews, own });
  const clear = useCallback(() => {
    abortRef.current?.abort();
    cancel();
    setPreviews(new Map());
    setIsPreviewing(false);
  }, [abortRef, cancel, setPreviews, setIsPreviewing]);
  useClearOnChange(split, root, clear);
  useEffect(() => () => cancel(), [cancel]);
  return { previews, isPreviewing, previewSelected, previewRow, clear };
}

/** Export settings or the root moved: every preview is stale, the settings decide. */
function useClearOnChange(split: SplitSettings, root: DirHandleLike | null, clear: () => void): void {
  useEffect(() => {
    clear();
  }, [split.mergeFrac, split.padding, split.size, split.transparent, root, clear]);
}

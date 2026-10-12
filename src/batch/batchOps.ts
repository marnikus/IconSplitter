// batchOps.ts — scan + process ops extracted to keep useBatch.ts <300 lines (RULE 18)
// Yields between heavy steps to keep UI responsive (RULE 5/7)

import { readDirTree, ensureDirPath, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { walkTree, collectAiImages, linkReferences, type AiImageEntry } from "../lib/scan";
import { syncAndCollect, applyOutcomes } from "./statewrite";
import { toOutcomes } from "./outcomes";
import type { SourceStatus } from "../lib/statefile";
import { processItems, type BatchItem, type ItemResult } from "./process";
import { OUTPUT_DIR } from "../lib/batchlayout";
import type { Preset } from "../lib/presets";
import { splitSheet } from "../lib/batchsplit";
import { loadImageFile } from "../lib/dom";
import type { Ctx, Row, RowMergeMap, Setter } from "./useBatchTypes";
import { makeBatchProgress, type BatchProgress } from "./BatchProgress";
import { yieldToFrame } from "../lib/yield";

async function scanImages(root: DirHandleLike, preset: Preset): Promise<AiImageEntry[]> {
  const tree = await readDirTree(root, preset.ignoreFolders);
  const entries = walkTree(tree, preset.ignoreFolders);
  return linkReferences(collectAiImages(entries), entries);
}

export function finishScan(
  images: AiImageEntry[],
  statuses: Map<string, SourceStatus>,
  setS: Setter,
  say: (m: string, e?: boolean) => void,
): void {
  setS((p) => {
    const existing = new Set(images.map((i) => i.relPath.toLowerCase()));
    const nextMerges: RowMergeMap = {};
    for (const [k, v] of Object.entries(p.rowMerges)) {
      if (existing.has(k)) nextMerges[k] = v;
    }
    return {
      ...p,
      busy: null,
      rows: images.map((img) => toRow(img, statuses)),
      refWarnings: images.filter((i) => i.refRelPath === null).map((i) => i.relPath),
      rowMerges: nextMerges,
    };
  });
  say(`Found ${images.length} AI image${images.length === 1 ? "" : "s"}`);
}

function toRow(img: AiImageEntry, statuses: Map<string, SourceStatus>): Row {
  const status = statuses.get(img.relPath.toLowerCase()) ?? "unprocessed";
  return { ...img, status, selected: status !== "missing" && status !== "deleted" };
}

export async function scan(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Scanning…", rootName: root.name }));
  try {
    const images = await scanImages(root, ctx.state.current.preset);
    const res = await syncAndCollect({
      root,
      images,
      prevKeys: ctx.keys.current,
      overrides: new Map(),
      now: new Date().toISOString(),
    });
    ctx.keys.current = res.keys;
    finishScan(images, res.statuses, setS, say);
  } catch (e) {
    setS((p) => ({ ...p, busy: null }));
    say((e as Error).message || "Scan failed", true);
  }
}

export async function batchProcess(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  ctx.stop.current = false;
  const selected = ctx.state.current.rows.filter((r) => r.selected);
  if (!selected.length) return setS((p) => ({ ...p, toast: { msg: "Nothing selected", err: true } }));
  const runId = makeRunId();
  const init = makeBatchProgress(selected.length, runId);
  init.currentRelPath = selected[0]?.relPath ?? null;
  init.currentName = selected[0]?.name ?? "";
  setS((p) => ({ ...p, busy: null, running: true, progress: init }));
  await yieldToFrame();
  const report = await runBatch({ ctx, root, selected, setS, init });
  await finalize(root, report.results, selected, setS);
}

function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type RunArgs = { ctx: Ctx; root: DirHandleLike; selected: Row[]; setS: Setter; init: BatchProgress };

async function runBatch(args: RunArgs) {
  const { ctx, root, selected, setS } = args;
  const items = await buildItems(root, selected);
  const dest = await resolveDest(ctx, root);
  const merges = ctx.state.current.rowMerges;
  const split = ctx.state.current.preset.split;
  const counters = { saved: 0, failed: 0, skipped: 0, results: [] as ItemResult[] };
  const onProgress = makeProgressUpdater(setS, selected, counters);
  const report = await processItems(items, {
    dest,
    split,
    splitImage: (file, s) => splitWithOverride(file, s, { merges, items, shouldStop: () => ctx.stop.current }),
    now: new Date(),
    shouldStop: () => ctx.stop.current,
    onProgress,
  });
  tallyExtra(report, counters);
  return report;
}

function makeProgressUpdater(setS: Setter, selected: Row[], counters: { saved: number; failed: number; skipped: number; results: ItemResult[] }) {
  return (done: number, _total: number, relPath: string, result?: ItemResult) => {
    if (result) pushResult(result, counters);
    const next = selected[done] ?? null;
    setS((p) => {
      const prev = p.progress;
      if (!prev) return p;
      return {
        ...p,
        progress: {
          ...prev,
          done,
          currentRelPath: next?.relPath ?? relPath,
          currentName: next?.name ?? prev.currentName,
          saved: counters.saved,
          failed: counters.failed,
          skipped: counters.skipped,
        },
      };
    });
  };
}

function pushResult(r: ItemResult, c: { saved: number; failed: number; skipped: number; results: ItemResult[] }) {
  c.results.push(r);
  if (r.outcome === "processed") c.saved++;
  else if (r.outcome === "failed") c.failed++;
  else c.skipped++;
}

function tallyExtra(report: { results: ItemResult[] }, c: { saved: number; failed: number; skipped: number; results: ItemResult[] }) {
  if (report.results.length <= c.results.length) return;
  for (let i = c.results.length; i < report.results.length; i++) {
    const r = report.results[i];
    if (r.outcome === "processed") c.saved++;
    else if (r.outcome === "failed") c.failed++;
    else c.skipped++;
  }
}

async function resolveDest(ctx: Ctx, root: DirHandleLike): Promise<DirHandleLike> {
  return ctx.dest.current ?? (await ensureDirPath(root, OUTPUT_DIR));
}

export function splitWithOverride(
  file: File,
  globalSplit: Preset["split"],
  ctx: { merges: RowMergeMap; items: BatchItem[]; shouldStop?: () => boolean },
): Promise<Blob[]> {
  const { merges, items, shouldStop } = ctx;
  const name = file.name.toLowerCase();
  for (const it of items) {
    if (it.source.name.toLowerCase() === name || it.source.relPath.toLowerCase().endsWith(name)) {
      const key = it.source.relPath.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(merges, key)) {
        const mf = merges[key];
        return splitSheetWithMerge(file, { ...globalSplit, mergeFrac: mf }, shouldStop);
      }
    }
  }
  return splitSheetWithMerge(file, globalSplit, shouldStop);
}

async function splitSheetWithMerge(file: File, split: Preset["split"], shouldStop?: () => boolean): Promise<Blob[]> {
  const img = await loadImageFile(file);
  return splitSheet(img, split, { shouldStop });
}

async function buildItems(root: DirHandleLike, rows: Row[]): Promise<BatchItem[]> {
  const out: BatchItem[] = [];
  for (const r of rows) {
    if (rows.length > 50 && out.length % 10 === 0) await yieldToFrame();
    out.push(await toItem(root, r));
  }
  return out;
}

async function toItem(root: DirHandleLike, r: Row): Promise<BatchItem> {
  return {
    source: { relPath: r.relPath, name: r.name, relDir: r.dirPath, refRelPath: r.refRelPath },
    file: await resolveFile(root, r.relPath),
    refFile: r.refRelPath ? await tryResolve(root, r.refRelPath) : null,
  };
}

async function resolveFile(root: DirHandleLike, relPath: string): Promise<FileHandleLike> {
  const idx = relPath.lastIndexOf("/");
  const dir = idx < 0 ? root : ((await probePathLocal(root, relPath.slice(0, idx))) as DirHandleLike);
  return dir.getFileHandle(relPath.slice(idx + 1), { create: false });
}

async function tryResolve(root: DirHandleLike, relPath: string): Promise<FileHandleLike | null> {
  try {
    return await resolveFile(root, relPath);
  } catch {
    return null;
  }
}

async function probePathLocal(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  let cur: DirHandleLike = root;
  for (const part of dirPath.split("/").filter(Boolean)) {
    try {
      cur = await cur.getDirectoryHandle(part, { create: false });
    } catch {
      return null;
    }
  }
  return cur;
}

function tally(results: ItemResult[]) {
  let done = 0, skipped = 0, failed = 0;
  for (const r of results) {
    if (r.outcome === "processed") done++;
    else if (r.outcome === "skipped") skipped++;
    else failed++;
  }
  return { done, skipped, failed };
}

async function finalize(
  root: DirHandleLike,
  results: ItemResult[],
  selected: Row[],
  setS: Setter,
): Promise<void> {
  const dirs = new Map(selected.map((r) => [r.relPath.toLowerCase(), r.dirPath]));
  const outcomes = toOutcomes(results, dirs);
  await applyOutcomes(root, outcomes, new Date().toISOString());
  const byPath = new Map(outcomes.map((o) => [o.relPath.toLowerCase(), o.status]));
  const c = tally(results);
  setS((p) => ({
    ...p,
    busy: null,
    running: false,
    rows: p.rows.map((r) => ({
      ...r,
      status: byPath.get(r.relPath.toLowerCase()) ?? r.status,
      selected: false,
    })),
    toast: { msg: `Processed ${c.done}, skipped ${c.skipped}, failed ${c.failed}`, err: c.failed > 0 },
  }));
}

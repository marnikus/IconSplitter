// batchOps.ts — scan + process ops (RULE 18), yields to keep UI responsive

import { armCompletionSound, startCompletionSound } from "../ui/completionSound";
import { readDirTree, ensureDirPath, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { walkTree, collectAiImages, linkReferences, type AiImageEntry } from "../lib/scan";
import { syncAndCollect, applyOutcomes, applyReviewOutcomes, type ReviewOutcome } from "./statewrite";
import { toOutcomes } from "./outcomes";
import type { SourceStatus, BatchReviewStatus } from "../lib/statefile";
import { processItems, type BatchItem, type ItemResult } from "./process";
import { OUTPUT_DIR } from "../lib/batchlayout";
import type { Preset } from "../lib/presets";
import { splitSheet } from "../lib/batchsplit";
import { loadSheet } from "../lib/dom";
import type { Ctx, Row, RowMergeMap, Setter } from "./useBatchTypes";
import { ensurePermission } from "./picker";
import { makeBatchProgress, type BatchProgress } from "./BatchProgress";
import { yieldToFrame } from "../lib/yield";
import { patchBatch } from "../state/appstore";

async function scanImages(root: DirHandleLike, preset: Preset): Promise<AiImageEntry[]> {
  const tree = await readDirTree(root, preset.ignoreFolders);
  await yieldToFrame();
  const entries = walkTree(tree, preset.ignoreFolders);
  await yieldToFrame();
  return linkReferences(collectAiImages(entries), entries);
}

type FinishArgs = { images: AiImageEntry[]; statuses: Map<string, SourceStatus>; reviews: Map<string, BatchReviewStatus>; setS: Setter; say: (m: string, e?: boolean) => void };

export function finishScan(a: FinishArgs): void {
  a.setS((p) => {
    const prevReview = new Map(p.rows.map((r) => [r.relPath.toLowerCase(), r.review]));
    const rows = a.images.map((img) => {
      const status = a.statuses.get(img.relPath.toLowerCase()) ?? "unprocessed";
      const diskReview = a.reviews.get(img.relPath.toLowerCase()) ?? "pending";
      const prev = prevReview.get(img.relPath.toLowerCase());
      const review = prev && prev !== "pending" ? prev : diskReview;
      return { ...img, status, review, selected: status !== "missing" && status !== "deleted" };
    });
    const checked = rows.filter((r) => r.selected).map((r) => r.relPath);
    try { patchBatch({ checked }); } catch { /* best-effort select-all */ }
    const existing = new Set(a.images.map((i) => i.relPath.toLowerCase()));
    const nextMerges: RowMergeMap = {};
    for (const [k, v] of Object.entries(p.rowMerges)) if (existing.has(k)) nextMerges[k] = v;
    return { ...p, busy: null, rows, refWarnings: a.images.filter((i) => i.refRelPath === null).map((i) => i.relPath), rowMerges: nextMerges };
  });
  a.say(`Found ${a.images.length} AI image${a.images.length === 1 ? "" : "s"}`);
}



export async function scan(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void, audible = false): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  const finish = audible ? startCompletionSound() : () => undefined;
  setS((p) => ({ ...p, busy: "Scanning…", rootName: root.name }));
  try {
    const images = await scanImages(root, ctx.state.current.preset);
    const res = await syncAndCollect({ root, images, prevKeys: ctx.keys.current, overrides: new Map(), reviewOverrides: new Map(), now: new Date().toISOString() });
    ctx.keys.current = res.keys;
    finishScan({ images, statuses: res.statuses, reviews: res.reviews, setS, say });
  } catch (e) {
    setS((p) => ({ ...p, busy: null }));
    say((e as Error).message || "Scan failed", true);
  } finally { finish(); }
}

/** A remembered custom dest re-grants inside the click's activation; refused → auto dest this run. */
async function regrantDest(ctx: Ctx): Promise<void> {
  if (ctx.dest.current && !(await ensurePermission(ctx.dest.current))) ctx.dest.current = null;
}

export async function batchProcess(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  armCompletionSound();
  ctx.stop.current = false;
  await regrantDest(ctx);
  const allRows = ctx.state.current.rows;
  const selected = allRows.filter((r) => r.selected && r.review === "approved");
  const skipped = allRows.filter((r) => r.selected && r.review !== "approved").length;
  if (!selected.length) {
    if (skipped > 0) return setS((p) => ({ ...p, toast: { msg: `${skipped} selected not approved — only approved can be split`, err: true } }));
    return setS((p) => ({ ...p, toast: { msg: "Nothing approved selected", err: true } }));
  }
  if (skipped > 0) setS((p) => ({ ...p, toast: { msg: `${skipped} not approved skipped, splitting ${selected.length} approved`, err: false } }));
  const runId = makeRunId();
  const init = makeBatchProgress(selected.length, runId);
  init.currentRelPath = selected[0]?.relPath ?? null;
  init.currentName = selected[0]?.name ?? "";
  setS((p) => ({ ...p, running: true, progress: init }));
  await executeBatch({ ctx, root, selected, setS, init });
}

function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type RunArgs = { ctx: Ctx; root: DirHandleLike; selected: Row[]; setS: Setter; init: BatchProgress };

/** Notify only after persisted outcomes settle; Stop never masquerades as completion. */
async function executeBatch(args: RunArgs): Promise<void> {
  const finish = startCompletionSound(args.init.runId);
  try {
    await yieldToFrame();
    const report = await runBatch(args);
    await finalize(args.root, report.results, args.selected, args.setS);
  } finally {
    args.setS((p) => ({ ...p, running: false }));
    finish(args.ctx.stop.current);
  }
}

async function runBatch(args: RunArgs) {
  const { ctx, root, selected, setS } = args;
  const items = await buildItems(root, selected);
  const dest = await resolveDest(ctx, root);
  const merges = ctx.state.current.rowMerges;
  const split = ctx.state.current.preset.split;
  const counters = { saved: 0, failed: 0, skipped: 0, results: [] as ItemResult[] };
  const onProgress = makeProgressUpdater(setS, selected, counters);
  const report = await processItems(items, {
    dest, split,
    splitImage: (file, s) => splitWithOverride(file, s, { merges, items, shouldStop: () => ctx.stop.current }),
    now: new Date(), shouldStop: () => ctx.stop.current, onProgress,
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
      return { ...p, progress: { ...prev, done, currentRelPath: next?.relPath ?? relPath, currentName: next?.name ?? prev.currentName, saved: counters.saved, failed: counters.failed, skipped: counters.skipped } };
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

export function splitWithOverride(file: File, globalSplit: Preset["split"], ctx: { merges: RowMergeMap; items: BatchItem[]; shouldStop?: () => boolean }): Promise<Blob[]> {
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
  const img = await loadSheet(file); // off-thread decode when the engine has it
  return splitSheet(img, split, { shouldStop });
}

async function buildItems(root: DirHandleLike, rows: Row[]): Promise<BatchItem[]> {
  const out: BatchItem[] = [];
  for (const r of rows) {
    if (rows.length > 20 && out.length % 5 === 0) await yieldToFrame();
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
  try { return await resolveFile(root, relPath); } catch { return null; }
}

async function probePathLocal(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  let cur: DirHandleLike = root;
  for (const part of dirPath.split("/").filter(Boolean)) {
    try { cur = await cur.getDirectoryHandle(part, { create: false }); } catch { return null; }
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

async function finalize(root: DirHandleLike, results: ItemResult[], selected: Row[], setS: Setter): Promise<void> {
  const dirs = new Map(selected.map((r) => [r.relPath.toLowerCase(), r.dirPath]));
  const outcomes = toOutcomes(results, dirs);
  await applyOutcomes(root, outcomes, new Date().toISOString());
  const byPath = new Map(outcomes.map((o) => [o.relPath.toLowerCase(), o.status]));
  const outByPath = new Map(results.filter((r) => r.outcome === "processed" && r.outRel).map((r) => [r.relPath.toLowerCase(), r.outRel]));
  const c = tally(results);
  setS((p) => ({
    ...p, running: false,
    rows: p.rows.map((r) => ({ ...r, status: byPath.get(r.relPath.toLowerCase()) ?? r.status, outRel: outByPath.get(r.relPath.toLowerCase()) ?? r.outRel, selected: false })),
    toast: { msg: `Processed ${c.done}, skipped ${c.skipped}, failed ${c.failed}`, err: c.failed > 0 },
  }));
  try { patchBatch({ checked: [] }); } catch { /* best-effort clear */ }
}

type DecideArgs = { ctx: Ctx; relPaths: string[]; review: BatchReviewStatus; setS: Setter; audible?: boolean };

export async function decideReview(a: DecideArgs): Promise<void> {
  const root = a.ctx.root.current;
  if (!root) return;
  const now = new Date().toISOString();
  const lowerSet = new Set(a.relPaths.map((p) => p.toLowerCase()));
  a.setS((p) => ({ ...p, rows: p.rows.map((r) => (lowerSet.has(r.relPath.toLowerCase()) ? { ...r, review: a.review } : r)) }));
  const grouped: ReviewOutcome[] = [];
  for (const rel of a.relPaths) {
    const row = a.ctx.state.current.rows.find((r) => r.relPath.toLowerCase() === rel.toLowerCase());
    if (!row) continue;
    const base = (row as any).ai?.base ?? row.name.replace(/_AI\..*$/, "").replace(/\..*$/, "");
    grouped.push({ dirPath: row.dirPath, base, relPath: row.relPath, review: a.review });
  }
  if (grouped.length > 0) {
    const finish = a.audible ? startCompletionSound() : () => undefined;
    try { await applyReviewOutcomes(root, grouped, now); } finally { finish(); }
  }
}

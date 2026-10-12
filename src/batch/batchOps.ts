// batchOps.ts — scan + process ops extracted to keep useBatch.ts <300 lines (RULE 18)
import { readDirTree, ensureDirPath, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { walkTree, collectAiImages, linkReferences, type AiImageEntry } from "../lib/scan";
import { syncAndCollect, applyOutcomes } from "./statewrite";
import { toOutcomes } from "./outcomes";
import type { SourceStatus } from "../lib/statefile";
import { processItems, type BatchItem, type ItemResult } from "./process";
import { OUTPUT_DIR } from "../lib/presets";
import type { Preset } from "../lib/presets";
import { splitSheet } from "../lib/batchsplit";
import { loadImageFile } from "../lib/dom";
import type { Ctx, Row, RowMergeMap, Setter } from "./useBatchTypes";

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
  setS((p) => ({ ...p, busy: "Preparing…" }));
  const report = await runBatch(ctx, root, selected, setS);
  await finalize(root, report.results, selected, setS);
}

async function runBatch(ctx: Ctx, root: DirHandleLike, selected: Row[], setS: Setter) {
  const items = await buildItems(root, selected);
  const dest = ctx.dest.current ?? (await ensureDirPath(root, OUTPUT_DIR));
  const merges = ctx.state.current.rowMerges;
  const globalSplit = ctx.state.current.preset.split;
  return processItems(items, {
    dest,
    split: globalSplit,
    splitImage: (file, split) => splitWithOverride(file, split, merges, items),
    now: new Date(),
    shouldStop: () => ctx.stop.current,
    onProgress: (d, t) => setS((p) => ({ ...p, busy: `Splitting ${d}/${t}…` })),
  });
}

export function splitWithOverride(
  file: File,
  globalSplit: Preset["split"],
  merges: RowMergeMap,
  items: BatchItem[],
): Promise<Blob[]> {
  const name = file.name.toLowerCase();
  for (const it of items) {
    if (it.source.name.toLowerCase() === name || it.source.relPath.toLowerCase().endsWith(name)) {
      const key = it.source.relPath.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(merges, key)) {
        const mf = merges[key];
        return splitSheetWithMerge(file, { ...globalSplit, mergeFrac: mf });
      }
    }
  }
  return splitSheetWithMerge(file, globalSplit);
}

async function splitSheetWithMerge(file: File, split: Preset["split"]): Promise<Blob[]> {
  return splitSheet(await loadImageFile(file), split);
}

async function buildItems(root: DirHandleLike, rows: Row[]): Promise<BatchItem[]> {
  const out: BatchItem[] = [];
  for (const r of rows) out.push(await toItem(root, r));
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
  let done = 0,
    skipped = 0,
    failed = 0;
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
    rows: p.rows.map((r) => ({
      ...r,
      status: byPath.get(r.relPath.toLowerCase()) ?? r.status,
      selected: false,
    })),
    toast: { msg: `Processed ${c.done}, skipped ${c.skipped}, failed ${c.failed}`, err: c.failed > 0 },
  }));
}

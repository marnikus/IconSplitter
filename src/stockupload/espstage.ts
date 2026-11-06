// espstage.ts — Local Getty ESP / DeepMeta 4 flat batch folder staging (`esp-batch`).
// Stages paired `<stem>.eps` + RGB `<stem>.jpg` + `getty_esp_metadata.csv` into
// `<root>/_getty_esp_batches/<batch>/` without overwriting user files (RULE 23)
// and without touching `export/` folders so `I-80` discovery stays clean.

import { ensureDirPath, nameExists, writeFileNew, type DirHandleLike } from "../lib/fs";
import { buildGettyEspCsv } from "../lib/stockupload/gettycsv";
import type { PlannedTransfer } from "../lib/stockupload/plan";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";

export const DEFAULT_ESP_STAGE_ROOT = "_getty_esp_batches";
export const GETTY_BATCH_CSV_NAME = "getty_esp_metadata.csv";

export function normalizeEspStageBase(remoteDir: string): string {
  const segs = remoteDir
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim().replace(/[^A-Za-z0-9._-]/g, "_"))
    .filter((s) => s !== "" && s !== "." && s !== ".." && s.toLowerCase() !== "export");
  return segs.length === 0 ? DEFAULT_ESP_STAGE_ROOT : segs.join("/");
}

function batchFolderStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `batch_${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}`;
}

export async function probeEspStageFolder(
  root: DirHandleLike | null,
  remoteDir: string,
): Promise<{ ok: true; relBase: string } | { ok: false; reason: string }> {
  if (!root) return { ok: false, reason: "Open a workspace folder first before testing ESP batch staging." };
  const relBase = normalizeEspStageBase(remoteDir);
  try {
    await ensureDirPath(root, relBase);
    return { ok: true, relBase };
  } catch {
    return { ok: false, reason: `Workspace denied write access to ${relBase}/ — grant folder write permission in browser.` };
  }
}

async function allocateUniqueBatchDir(root: DirHandleLike, relBase: string): Promise<{ dir: DirHandleLike; relDir: string }> {
  const baseDir = await ensureDirPath(root, relBase);
  const baseName = batchFolderStamp();
  let candidate = baseName;
  let suffix = 2;
  while (await nameExists("dir", baseDir, candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }
  const dir = await baseDir.getDirectoryHandle(candidate, { create: true });
  return { dir, relDir: `${relBase}/${candidate}` };
}

function allocateStagedStems(items: readonly ExportedItem[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const item of items) {
    let candidate = item.stem;
    let idx = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${item.stem}_${idx}`;
      idx += 1;
    }
    used.add(candidate.toLowerCase());
    out.set(item.id, candidate);
  }
  return out;
}

function remapItemStem(item: ExportedItem, stagedStem: string): ExportedItem {
  if (stagedStem === item.stem) return item;
  const renameRef = <T extends { fileName: string } | null>(ref: T): T => {
    if (!ref) return ref;
    const dot = ref.fileName.lastIndexOf(".");
    const ext = dot >= 0 ? ref.fileName.slice(dot) : "";
    return { ...ref, fileName: `${stagedStem}${ext}` };
  };
  return {
    ...item,
    stem: stagedStem,
    files: {
      raster: renameRef(item.files.raster),
      svg: renameRef(item.files.svg),
      eps: renameRef(item.files.eps),
      zip: renameRef(item.files.zip),
    },
  };
}

function stagedFileName(originalName: string, stagedStem: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot >= 0 ? originalName.slice(dot) : "";
  return `${stagedStem}${ext}`;
}

export interface StageStepHandlers {
  root: DirHandleLike;
  signal: AbortSignal;
  readTaskBytes: (item: ExportedItem, task: PlannedTransfer) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }>;
  onTaskResult: (task: PlannedTransfer, res: { ok: true } | { ok: false; reason: string }) => void;
}

interface StageTaskRunCtx {
  batchDir: DirHandleLike;
  itemsById: ReadonlyMap<string, ExportedItem>;
  stemMap: ReadonlyMap<string, string>;
  handlers: StageStepHandlers;
}

async function stageSinglePlannedTask(task: PlannedTransfer, ctx: StageTaskRunCtx): Promise<boolean> {
  const item = ctx.itemsById.get(task.itemId);
  if (!item) {
    ctx.handlers.onTaskResult(task, { ok: false, reason: "item no longer present" });
    return false;
  }
  const payload = await ctx.handlers.readTaskBytes(item, task);
  if (!payload.ok) {
    ctx.handlers.onTaskResult(task, payload);
    return false;
  }
  const outName = stagedFileName(task.fileName, ctx.stemMap.get(item.id) ?? item.stem);
  try {
    const copy = new Uint8Array(payload.bytes.byteLength);
    copy.set(payload.bytes);
    await writeFileNew(ctx.batchDir, outName, new Blob([copy]));
    ctx.handlers.onTaskResult(task, { ok: true });
    return true;
  } catch (err) {
    ctx.handlers.onTaskResult(task, { ok: false, reason: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export async function runEspBatchStageTarget(
  target: StockFtpPreset,
  targetTasks: readonly PlannedTransfer[],
  selectedRows: readonly ExportedItem[],
  handlers: StageStepHandlers,
): Promise<string | null> {
  const { dir: batchDir, relDir } = await allocateUniqueBatchDir(handlers.root, normalizeEspStageBase(target.remoteDir));
  const itemsById = new Map(selectedRows.map((r) => [r.id, r]));
  const taskItems = [...new Set(targetTasks.map((t) => t.itemId))].flatMap((id) => itemsById.get(id) ?? []);
  const stemMap = allocateStagedStems(taskItems);
  const succeededIds = new Set<string>();
  const ctx: StageTaskRunCtx = { batchDir, itemsById, stemMap, handlers };
  for (const task of targetTasks) {
    if (handlers.signal.aborted) break;
    if (await stageSinglePlannedTask(task, ctx)) succeededIds.add(task.itemId);
  }
  if (succeededIds.size > 0 && !handlers.signal.aborted) {
    const csvRows = taskItems.filter((it) => succeededIds.has(it.id)).map((it) => remapItemStem(it, stemMap.get(it.id) ?? it.stem));
    await writeFileNew(batchDir, GETTY_BATCH_CSV_NAME, new Blob([buildGettyEspCsv(csvRows)], { type: "text/csv;charset=utf-8" }));
  }
  return relDir;
}

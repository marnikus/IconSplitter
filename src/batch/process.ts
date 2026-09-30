// process.ts — batch orchestrator (spec §5, §6; RULE 5/7/23).
// Owns: planning the output tree, then per-item split + write with no-overwrite,
// reference copy, and isolated per-item failures + stop. Pure-ish: IO via the
// injected handle interfaces and the injected splitImage function (RULE 8).

import { planBatch, type BatchSource } from "../lib/output";
import { probePath, ensureDirPath, listChildNames, writeFileNew, copyFileTo, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { splitImageName, batchPath, pad2 } from "../lib/naming";
import type { SplitSettings } from "../lib/presets";

export interface BatchItem {
  source: BatchSource;
  file: FileHandleLike;
  refFile: FileHandleLike | null;
}

export interface ProcessDeps {
  dest: DirHandleLike;
  split: SplitSettings;
  splitImage: (file: File, split: SplitSettings) => Promise<Blob[]>;
  now?: Date;
  shouldStop?: () => boolean;
  onProgress?: (done: number, total: number, relPath: string) => void;
}

export type Outcome = "processed" | "skipped" | "failed";

export interface ItemResult {
  relPath: string;
  outcome: Outcome;
  folder: string;
  splits: number;
  refCopied: boolean;
  message?: string;
}

export interface BatchReport {
  relBase: string;
  results: ItemResult[];
  stopped: boolean;
}

export async function processItems(items: BatchItem[], deps: ProcessDeps): Promise<BatchReport> {
  const now = deps.now ?? new Date();
  const relBase = batchPath(now);
  const plan = planBatch(items.map((i) => i.source), await existingLookup(deps.dest, relBase, items), now);
  const results: ItemResult[] = [];
  let stopped = false;
  for (let i = 0; i < items.length; i++) {
    if (deps.shouldStop?.()) { stopped = true; break; }
    results.push(await processOne(items[i], plan.items[i].relFolder, deps, plan.items[i].folder));
    deps.onProgress?.(i + 1, items.length, items[i].source.relPath); // RULE 5 live progress
  }
  return { relBase, results, stopped };
}

async function existingLookup(dest: DirHandleLike, relBase: string, items: BatchItem[]): Promise<(d: string) => string[]> {
  const cache = new Map<string, string[]>();
  for (const rd of uniqueDirs(items)) {
    const dir = await probePath(dest, rd === "" ? relBase : `${relBase}/${rd}`);
    cache.set(rd, dir ? await listChildNames(dir) : []);
  }
  return (rd) => cache.get(rd) ?? [];
}

function uniqueDirs(items: BatchItem[]): string[] {
  return [...new Set(items.map((i) => i.source.relDir))];
}

interface WriteCtx {
  item: BatchItem;
  destRel: string;
  folder: string;
  deps: ProcessDeps;
}

async function processOne(item: BatchItem, destRel: string, deps: ProcessDeps, folder: string): Promise<ItemResult> {
  const base = { relPath: item.source.relPath, folder, splits: 0, refCopied: false };
  const file = await tryLoad(item.file);
  if (!file) return { ...base, outcome: "skipped", message: "Source file missing before processing" };
  const blobs = await trySplit(file, deps);
  if (blobs instanceof Error) return { ...base, outcome: "failed", message: blobs.message };
  if (blobs.length === 0) return { ...base, outcome: "skipped", message: "No icons detected" };
  return writeResult({ item, destRel, folder, deps }, blobs, base);
}

async function tryLoad(fh: FileHandleLike): Promise<File | null> {
  try {
    return await fh.getFile();
  } catch {
    return null;
  }
}

async function trySplit(file: File, deps: ProcessDeps): Promise<Blob[] | Error> {
  try {
    return await deps.splitImage(file, deps.split);
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

async function writeResult(
  ctx: WriteCtx, blobs: Blob[], base: { relPath: string; folder: string; splits: number; refCopied: boolean },
): Promise<ItemResult> {
  const root = await ensureDirPath(ctx.deps.dest, ctx.destRel);
  const splitDirs = await writeSplits(root, ctx.folder, blobs);
  const refCopied = await copyRefs(ctx.item.refFile, splitDirs);
  const message = refCopied ? undefined : "Reference image missing — exported without it";
  return { ...base, outcome: "processed", splits: blobs.length, refCopied, message };
}

async function writeSplits(root: DirHandleLike, folder: string, blobs: Blob[]): Promise<DirHandleLike[]> {
  const dirs: DirHandleLike[] = [];
  for (let j = 0; j < blobs.length; j++) {
    const splitDir = await ensureDirPath(root, `split_${pad2(j + 1)}`);
    await writeFileNew(splitDir, splitImageName(folder, j + 1), blobs[j]);
    dirs.push(splitDir);
  }
  return dirs;
}

async function copyRefs(refFile: FileHandleLike | null, splitDirs: DirHandleLike[]): Promise<boolean> {
  if (!refFile) return false;
  for (const d of splitDirs) await copyFileTo(refFile, d, refFile.name);
  return true;
}

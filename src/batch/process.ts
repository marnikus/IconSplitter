// process.ts owns batch splitting: re-read, decode, detect, render, write.
// Pixel work delegates to src/lib (RULE 1); abort + progress are explicit.

import { analyze, detect, type Analysis, type Box } from "../lib/detect";
import { canvasToBlob, renderIcon, squareInfo, type ExportOpts, type SquareInfo } from "../lib/render";
import { ensureDir, ensureFirstFreeDir, isNotFound, tryGetFile, writeFile, writeFirstFree, type FsDirHandle, type FsFile, type FsFileHandle } from "./fs";
import { batchFolder, dirCandidates, monthFolder, splitCandidates, splitDirName, statusJsonName } from "./naming";
import { joinRel } from "./paths";
import type { BatchSettings } from "./presets";
import { buildStatus, groupKeyOf, statusGroupOf, type StatusGroupKey, type Tracked, type TrackState } from "./status";

const TRIES = 100;

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export interface ProcessItem {
  relPath: string;
  dir: string;
  name: string;
  stem: string;
  handle: FsFileHandle;
  refName: string;
  refFound: boolean;
  refHandle: FsFileHandle | null;
}

export interface GroupRef {
  reference: string;
  referenceFound: boolean;
}

export interface ProcessInput {
  dirs: Map<string, FsDirHandle>;
  outputRoot: FsDirHandle;
  items: ProcessItem[];
  tracked: Tracked[];
  refs: Map<string, GroupRef>;
  settings: BatchSettings;
  now: Date;
  decode: (file: FsFile) => Promise<HTMLImageElement>;
  onProgress: (done: number, total: number, label: string) => void;
  shouldAbort: () => boolean;
}

export interface ItemOutcome {
  relPath: string;
  state: TrackState;
  note?: string;
  size: number;
  mtime: number;
  output?: string;
  icons: number;
  failed: boolean;
}

export interface ItemReason {
  relPath: string;
  reason: string;
}

export interface BatchReport {
  processed: number;
  icons: number;
  skipped: ItemReason[];
  failed: ItemReason[];
  outcomes: ItemOutcome[];
  interrupted: boolean;
  batchPath: string;
}

interface Detected {
  img: HTMLImageElement;
  an: Analysis;
  boxes: Box[];
}

interface ItemJob {
  input: ProcessInput;
  batch: FsDirHandle;
  item: ProcessItem;
  file: FsFile;
  det: Detected;
}

interface RefCopy {
  name: string;
  bytes: ArrayBuffer;
}

interface IconTarget {
  parent: FsDirHandle;
  parentName: string;
  ref: RefCopy | null;
  sq: SquareInfo;
}

interface FinishArgs {
  item: ProcessItem;
  file: FsFile;
  output: string;
  saved: number;
  total: number;
  problems: string[];
  aborted: boolean;
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

function exportOptsOf(s: BatchSettings): ExportOpts {
  return { padding: s.split.padding, size: s.split.size, transparent: s.split.transparent };
}

function batchStamp(now: Date, prefix: string): { month: string; candidates: string[] } {
  return { month: monthFolder(now), candidates: dirCandidates(batchFolder(now), prefix, TRIES) };
}

function emptyReport(batchPath: string): BatchReport {
  return { processed: 0, icons: 0, skipped: [], failed: [], outcomes: [], interrupted: false, batchPath };
}

async function freshFile(item: ProcessItem): Promise<FsFile | null> {
  try {
    return await item.handle.getFile();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function tryDecode(decode: (file: FsFile) => Promise<HTMLImageElement>, file: FsFile): Promise<HTMLImageElement | null> {
  try {
    return await decode(file);
  } catch {
    return null;
  }
}

async function ensureRelDir(root: FsDirHandle, relDir: string): Promise<FsDirHandle> {
  let cur = root;
  for (const part of relDir.split("/")) {
    if (!part) continue;
    cur = await ensureDir(cur, part);
  }
  return cur;
}

async function refBytesOf(item: ProcessItem): Promise<RefCopy | null> {
  if (!item.refFound || !item.refHandle) return null;
  try {
    const f = await item.refHandle.getFile();
    return { name: f.name, bytes: await f.arrayBuffer() };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

interface RenderJob {
  img: HTMLImageElement;
  an: Analysis;
  boxes: Box[];
  box: Box;
  sq: SquareInfo;
}

async function renderBlob(job: RenderJob, opts: ExportOpts): Promise<Blob> {
  const canvas = renderIcon(job.img, job.an, job.boxes, job.box, job.sq, opts);
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error("render produced an empty canvas");
  const blob = await canvasToBlob(canvas);
  if (blob.size <= 0) throw new Error("render produced an empty file");
  return blob;
}

async function copyReference(splitDir: FsDirHandle, ref: RefCopy): Promise<void> {
  if (await tryGetFile(splitDir, ref.name)) return;
  await writeFile(splitDir, ref.name, ref.bytes);
}

async function saveIcon(blob: Blob, target: IconTarget, index1: number, input: ProcessInput): Promise<void> {
  const splitDir = await ensureDir(target.parent, splitDirName(index1, input.settings.naming.splitPrefix));
  const cands = splitCandidates(target.parentName, index1, {
    ext: input.settings.naming.splitExt,
    prefix: input.settings.duplicates.variationPrefix,
    tries: TRIES,
  });
  await writeFirstFree(splitDir, cands, blob);
  if (target.ref) await copyReference(splitDir, target.ref);
}

async function tryIcon(job: ItemJob, target: IconTarget, index0: number): Promise<string | null> {
  try {
    const blob = await renderBlob(
      { img: job.det.img, an: job.det.an, boxes: job.det.boxes, box: job.det.boxes[index0], sq: target.sq },
      exportOptsOf(job.input.settings),
    );
    await saveIcon(blob, target, index0 + 1, job.input);
    return null;
  } catch (e) {
    return `icon ${index0 + 1}: ${messageOf(e)}`;
  }
}

function finishOutcome(a: FinishArgs): ItemOutcome {
  const base = { relPath: a.item.relPath, size: a.file.size, mtime: a.file.lastModified, output: a.output };
  if (a.aborted) return { ...base, state: "skipped", note: `interrupted after ${a.saved} icons`, icons: a.saved, failed: false };
  if (!a.saved) return { ...base, state: "skipped", note: a.problems.join("; ") || "no icons saved", icons: 0, failed: true };
  if (a.problems.length) return { ...base, state: "processed", note: `${a.saved}/${a.total} icons saved: ${a.problems.join("; ")}`, icons: a.saved, failed: false };
  return { ...base, state: "processed", icons: a.saved, failed: false };
}

async function saveItem(job: ItemJob): Promise<ItemOutcome> {
  const sq = squareInfo(job.det.boxes, job.input.settings.split.padding);
  const target = await ensureRelDir(job.batch, job.item.dir);
  const parent = await ensureFirstFreeDir(target, dirCandidates(job.item.stem, job.input.settings.duplicates.variationPrefix, TRIES));
  const ref = await refBytesOf(job.item);
  const iconTarget: IconTarget = { parent: parent.handle, parentName: parent.name, ref, sq };
  let saved = 0;
  const problems: string[] = [];
  for (let i = 0; i < job.det.boxes.length; i++) {
    if (job.input.shouldAbort()) break;
    const err = await tryIcon(job, iconTarget, i);
    if (err) problems.push(err);
    else saved++;
  }
  return finishOutcome({ item: job.item, file: job.file, output: joinRel(job.item.dir, parent.name), saved, total: job.det.boxes.length, problems, aborted: job.input.shouldAbort() });
}

async function processOne(input: ProcessInput, batch: FsDirHandle, live: Map<string, Tracked>, item: ProcessItem): Promise<ItemOutcome> {
  const prev = live.get(item.relPath);
  const file = await freshFile(item);
  if (!file) return { relPath: item.relPath, state: "deleted", note: "deleted before processing", size: prev?.size ?? 0, mtime: prev?.mtime ?? 0, icons: 0, failed: true };
  const img = await tryDecode(input.decode, file);
  if (!img) return { relPath: item.relPath, state: "skipped", note: "could not decode image", size: file.size, mtime: file.lastModified, icons: 0, failed: true };
  const an = analyze(img);
  const boxes = detect(an, input.settings.split.mergeFrac).boxes;
  if (!boxes.length) return { relPath: item.relPath, state: "skipped", note: "no icons detected", size: file.size, mtime: file.lastModified, icons: 0, failed: false };
  return saveItem({ input, batch, item, file, det: { img, an, boxes } });
}

function refreshLive(live: Map<string, Tracked>, o: ItemOutcome, nowIso: string): void {
  const prev = live.get(o.relPath) ?? { relPath: o.relPath, size: 0, mtime: 0, state: "unprocessed" as TrackState, lastSeen: nowIso };
  live.set(o.relPath, {
    ...prev,
    size: o.size,
    mtime: o.mtime,
    state: o.state,
    note: o.note,
    output: o.output ?? prev.output,
    lastSeen: o.state === "deleted" ? prev.lastSeen : nowIso,
    lastDone: o.state === "processed" ? nowIso : prev.lastDone,
  });
}

function inGroup(t: Tracked, key: StatusGroupKey): boolean {
  const g = statusGroupOf(t.relPath);
  return g !== null && g.dir === key.dir && g.base === key.base;
}

async function persistGroup(input: ProcessInput, live: Map<string, Tracked>, relPath: string): Promise<void> {
  const key = statusGroupOf(relPath);
  if (!key) return;
  const dirHandle = input.dirs.get(key.dir);
  const ref = input.refs.get(groupKeyOf(key));
  if (!dirHandle || !ref) return;
  const images = [...live.values()].filter((t) => inGroup(t, key));
  await writeFile(dirHandle, statusJsonName(key.base), JSON.stringify(buildStatus({ base: key.base, ...ref }, images, input.now.toISOString())));
}

async function applyOutcome(input: ProcessInput, live: Map<string, Tracked>, report: BatchReport, o: ItemOutcome): Promise<void> {
  report.outcomes.push(o);
  if (o.failed) report.failed.push({ relPath: o.relPath, reason: o.note ?? "failed" });
  else if (o.state === "processed") {
    report.processed++;
    report.icons += o.icons;
  } else report.skipped.push({ relPath: o.relPath, reason: o.note ?? "skipped" });
  refreshLive(live, o, input.now.toISOString());
  await persistGroup(input, live, o.relPath);
}

export async function processBatch(input: ProcessInput): Promise<BatchReport> {
  const stamp = batchStamp(input.now, input.settings.duplicates.variationPrefix);
  const month = await ensureDir(input.outputRoot, stamp.month);
  const batch = await ensureFirstFreeDir(month, stamp.candidates);
  const live = new Map(input.tracked.map((t) => [t.relPath, t]));
  const report = emptyReport(joinRel(stamp.month, batch.name));
  for (let n = 0; n < input.items.length; n++) {
    if (input.shouldAbort()) break;
    const outcome = await processOne(input, batch.handle, live, input.items[n]);
    await applyOutcome(input, live, report, outcome);
    input.onProgress(n + 1, input.items.length, input.items[n].name);
    await sleep();
  }
  report.interrupted = input.shouldAbort();
  return report;
}

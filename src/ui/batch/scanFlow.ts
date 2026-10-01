// scanFlow.ts owns source scanning + review items + folder picking. It also
// hosts the shared flow context types used by processFlow/presetFlow.

import type { Dispatch } from "react";
import { canPickFolders, pickFolder, writeFile, type FsDirHandle, type FsFile } from "../../batch/fs";
import { referenceNameFor, statusJsonName } from "../../batch/naming";
import { dirOf, fileOf } from "../../batch/paths";
import type { BatchSettings } from "../../batch/presets";
import { messageOf, type GroupRef } from "../../batch/process";
import { eligibleRelPaths, type BatchAction, type BatchItem, type BatchState } from "../../batch/reducer";
import { aiImages, findReference, groupByDir, readHistory, scanRoot, type ScannedFile, type ScanOpts, type ScanResult } from "../../batch/scan";
import { buildStatus, flattenStatuses, groupByStatusFile, groupKeyOf, parseGroupKey, reconcileScan, statusGroupOf, type FileId, type ReconcileEvents, type StatusFile, type Tracked } from "../../batch/status";

export type Say = (msg: string, err?: boolean) => void;

export interface FlowCtx {
  snap: BatchState;
  dispatch: Dispatch<BatchAction>;
  say: Say;
  setBusy: (msg: string | null) => void;
  thumbs: { current: string[] };
  abort: { current: boolean };
  onMissingRefs: (items: BatchItem[]) => void;
}

export interface ScanApplied {
  items: BatchItem[];
  selected: string[];
  dirs: Map<string, FsDirHandle>;
  tracked: Tracked[];
}

function scanOptsOf(s: BatchSettings): ScanOpts {
  return { includeExtensions: s.scan.includeExtensions, outputDirName: s.naming.outputDirName, useContentHash: s.scan.useContentHash, ignoreOutputDir: s.scan.ignoreOutputDir };
}

function toFileId(f: ScannedFile): FileId {
  return { relPath: f.relPath, size: f.size, mtime: f.mtime, hash: f.hash };
}

export function revokeThumbs(thumbs: { current: string[] }): void {
  for (const u of thumbs.current) URL.revokeObjectURL(u);
  thumbs.current = [];
}

function thumbUrlOf(file: FsFile): string {
  // Real getFile() returns a File (a Blob); the cast bridges the narrow FsFile view.
  return URL.createObjectURL(file as unknown as Blob);
}

function toItem(f: ScannedFile, siblings: ScannedFile[], t: Tracked | undefined, urls: string[]): BatchItem {
  const ref = findReference(f, siblings);
  const url = thumbUrlOf(f.file);
  urls.push(url);
  return {
    relPath: f.relPath,
    dir: f.dir,
    name: f.name,
    size: f.size,
    mtime: f.mtime,
    state: t?.state ?? "unprocessed",
    note: t?.note,
    referenceName: ref ? ref.name : (referenceNameFor(f.name) ?? f.name),
    referenceFound: ref !== null,
    thumbUrl: url,
    source: f,
    ref: ref ?? undefined,
  };
}

function missingItem(t: Tracked): BatchItem {
  const name = fileOf(t.relPath);
  return { relPath: t.relPath, dir: dirOf(t.relPath), name, size: t.size, mtime: t.mtime, state: t.state, note: t.note, referenceName: referenceNameFor(name) ?? name, referenceFound: false, thumbUrl: null, source: null };
}

function missingItems(ai: ScannedFile[], next: Tracked[], keep: boolean): BatchItem[] {
  if (!keep) return [];
  const present = new Set(ai.map((f) => f.relPath));
  return next.filter((t) => !present.has(t.relPath) && (t.state === "missing" || t.state === "deleted")).map(missingItem);
}

function buildItems(ctx: FlowCtx, ai: ScannedFile[], found: ScanResult, next: Tracked[]): BatchItem[] {
  revokeThumbs(ctx.thumbs);
  const byDir = groupByDir(found.files);
  const states = new Map(next.map((t) => [t.relPath, t]));
  const urls: string[] = [];
  const items = ai.map((f) => toItem(f, byDir.get(f.dir) ?? [], states.get(f.relPath), urls));
  items.push(...missingItems(ai, next, ctx.snap.settings.selection.keepMissingInList));
  ctx.thumbs.current = urls;
  return items;
}

function selectFor(items: BatchItem[], snap: BatchState): string[] {
  const before = new Set(snap.items.map((i) => i.relPath));
  const kept = new Set(snap.selected);
  const auto = snap.settings.selection.autoSelectNew;
  return eligibleRelPaths(items).filter((r) => kept.has(r) || (auto && !before.has(r)));
}

export function refInfoOf(items: BatchItem[]): Map<string, GroupRef> {
  const out = new Map<string, GroupRef>();
  for (const i of items) {
    const key = statusGroupOf(i.relPath);
    if (key) out.set(groupKeyOf(key), { reference: i.referenceName, referenceFound: i.referenceFound });
  }
  return out;
}

function histRef(h: StatusFile | undefined): GroupRef {
  return h ? { reference: h.reference, referenceFound: h.referenceFound } : { reference: "", referenceFound: false };
}

interface GroupWrite {
  dirs: Map<string, FsDirHandle>;
  dir: string;
  base: string;
  images: Tracked[];
  ref: GroupRef;
  now: string;
}

async function writeGroupStatus(w: GroupWrite): Promise<void> {
  const handle = w.dirs.get(w.dir);
  if (!handle) return;
  await writeFile(handle, statusJsonName(w.base), JSON.stringify(buildStatus({ base: w.base, ...w.ref }, w.images, w.now)));
}

async function writeScanStatuses(found: ScanResult, next: Tracked[], history: Map<string, StatusFile>, items: BatchItem[]): Promise<void> {
  const now = new Date().toISOString();
  const refs = refInfoOf(items);
  const groups = groupByStatusFile(next);
  for (const [id, g] of groups) {
    await writeGroupStatus({ dirs: found.dirs, dir: g.dir, base: g.base, images: g.images, ref: refs.get(id) ?? histRef(history.get(id)), now });
  }
  for (const [id, h] of history) {
    if (groups.has(id)) continue;
    const key = parseGroupKey(id);
    if (key) await writeGroupStatus({ dirs: found.dirs, dir: key.dir, base: key.base, images: h.images, ref: histRef(h), now });
  }
}

function scanSummary(count: number, events: ReconcileEvents, skipped: number): string {
  const bits = [`${count} eligible image${count === 1 ? "" : "s"}`];
  if (events.added.length) bits.push(`${events.added.length} new`);
  if (events.changed.length) bits.push(`${events.changed.length} changed`);
  if (events.moved.length) bits.push(`${events.moved.length} moved`);
  if (events.missing.length + events.deleted.length) bits.push(`${events.missing.length + events.deleted.length} gone`);
  if (skipped) bits.push(`${skipped} unreadable skipped`);
  return `Scan: ${bits.join(", ")}`;
}

function reportEmptyScan(ctx: FlowCtx, found: ScanResult): void {
  revokeThumbs(ctx.thumbs);
  ctx.dispatch({ type: "scan-applied", items: [], selected: [] });
  ctx.say(found.files.length ? "No eligible _AI images found" : "No images found in this folder", true);
}

export async function runScan(ctx: FlowCtx, srcOverride?: FsDirHandle): Promise<ScanApplied | null> {
  const src = srcOverride ?? ctx.snap.folders.source;
  if (!src) {
    ctx.say("Choose a source folder first", true);
    return null;
  }
  ctx.setBusy("Scanning folders…");
  try {
    const found = await scanRoot(src, scanOptsOf(ctx.snap.settings));
    const ai = aiImages(found.files);
    if (!ai.length) {
      reportEmptyScan(ctx, found);
      return null;
    }
    const history = await readHistory(found.status);
    const now = new Date().toISOString();
    const rec = reconcileScan(flattenStatuses(history), ai.map(toFileId), { now, useHash: ctx.snap.settings.scan.useContentHash });
    const items = buildItems(ctx, ai, found, rec.next);
    await writeScanStatuses(found, rec.next, history, items);
    const selected = selectFor(items, ctx.snap);
    ctx.dispatch({ type: "scan-applied", items, selected });
    ctx.say(scanSummary(ai.length, rec.events, found.skipped));
    return { items, selected, dirs: found.dirs, tracked: rec.next };
  } catch (e) {
    ctx.say(`Scan failed: ${messageOf(e)}`, true);
    return null;
  } finally {
    ctx.setBusy(null);
  }
}

export async function pickSource(ctx: FlowCtx): Promise<void> {
  if (!canPickFolders()) {
    ctx.say("Folder picking needs Chrome or Edge", true);
    return;
  }
  const handle = await pickFolder();
  if (!handle) return;
  ctx.dispatch({ type: "source-set", handle, name: handle.name });
  await runScan(ctx, handle);
}

export async function pickDest(ctx: FlowCtx): Promise<void> {
  if (!canPickFolders()) {
    ctx.say("Folder picking needs Chrome or Edge", true);
    return;
  }
  const handle = await pickFolder();
  if (!handle) return;
  ctx.dispatch({ type: "dest-set", handle, name: handle.name });
  ctx.say(`Destination “${handle.name}” selected`);
}

export async function copyDisplayPath(item: BatchItem, rootName: string, say: Say): Promise<void> {
  const full = rootName ? `${rootName}/${item.relPath}` : item.relPath;
  try {
    await navigator.clipboard.writeText(full);
    say(`Path copied: ${full}`);
  } catch {
    say(`Path (copy manually, clipboard blocked): ${full}`, true);
  }
}

// scan.ts owns source-root scanning: recursive walk, AI partition,
// reference linking, status-history reads.

import { type FsDirHandle, type FsFile, type FsFileHandle, isNotFound, readTextFile } from "./fs";
import { baseOfAi, isAiFile, statusJsonName, stemOf } from "./naming";
import { extOf, isIgnoredDir, isImageExt, joinRel } from "./paths";
import { fnv1aHex, groupKeyOf, parseStatus, type StatusFile } from "./status";

export interface ScanOpts {
  includeExtensions: string[];
  outputDirName: string;
  useContentHash: boolean;
  ignoreOutputDir: boolean;
}

export interface ScannedFile {
  relPath: string;
  dir: string;
  name: string;
  size: number;
  mtime: number;
  hash?: string;
  handle: FsFileHandle;
  file: FsFile;
}

export interface StatusCandidate {
  dir: string;
  name: string;
  handle: FsDirHandle;
}

export interface ScanResult {
  files: ScannedFile[];
  dirs: Map<string, FsDirHandle>;
  status: StatusCandidate[];
  skipped: number;
}

interface WalkCtx {
  opts: ScanOpts;
  files: ScannedFile[];
  dirs: Map<string, FsDirHandle>;
  status: StatusCandidate[];
  skipped: number;
}

async function hashOf(file: FsFile, useHash: boolean): Promise<string | undefined> {
  if (!useHash) return undefined;
  return fnv1aHex(new Uint8Array(await file.arrayBuffer()));
}

async function scannedFile(rel: string, handle: FsFileHandle, file: FsFile, opts: ScanOpts): Promise<ScannedFile> {
  const hash = await hashOf(file, opts.useContentHash);
  return { relPath: joinRel(rel, handle.name), dir: rel, name: handle.name, size: file.size, mtime: file.lastModified, hash, handle, file };
}

async function collectFile(dir: FsDirHandle, entry: FsFileHandle, rel: string, ctx: WalkCtx): Promise<void> {
  if (extOf(entry.name) === "json") {
    ctx.status.push({ dir: rel, name: entry.name, handle: dir });
    return;
  }
  if (!isImageExt(entry.name, ctx.opts.includeExtensions)) return;
  try {
    const file = await entry.getFile();
    ctx.files.push(await scannedFile(rel, entry, file, ctx.opts));
  } catch (e) {
    if (isNotFound(e)) return;
    ctx.skipped++;
  }
}

async function walkSub(entry: FsDirHandle, rel: string, ctx: WalkCtx): Promise<void> {
  if (ctx.opts.ignoreOutputDir && isIgnoredDir(entry.name, ctx.opts.outputDirName)) return;
  const sub = joinRel(rel, entry.name);
  ctx.dirs.set(sub, entry);
  await walkDir(entry, sub, ctx);
}

async function walkDir(dir: FsDirHandle, rel: string, ctx: WalkCtx): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") await walkSub(entry, rel, ctx);
    else await collectFile(dir, entry, rel, ctx);
  }
}

export async function scanRoot(root: FsDirHandle, opts: ScanOpts): Promise<ScanResult> {
  const ctx: WalkCtx = { opts, files: [], dirs: new Map([["", root]]), status: [], skipped: 0 };
  await walkDir(root, "", ctx);
  return { files: ctx.files, dirs: ctx.dirs, status: ctx.status, skipped: ctx.skipped };
}

export function aiImages(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) => isAiFile(f.name));
}

export function groupByDir(files: ScannedFile[]): Map<string, ScannedFile[]> {
  const out = new Map<string, ScannedFile[]>();
  for (const f of files) {
    const hit = out.get(f.dir);
    if (hit) hit.push(f);
    else out.set(f.dir, [f]);
  }
  return out;
}

function preferSameExt(cands: ScannedFile[], ext: string): ScannedFile | null {
  return cands.find((f) => extOf(f.name) === ext) ?? cands[0] ?? null;
}

export function findReference(ai: ScannedFile, dirFiles: ScannedFile[]): ScannedFile | null {
  const base = baseOfAi(ai.name);
  if (!base) return null;
  const cands = dirFiles.filter((f) => !isAiFile(f.name) && stemOf(f.name) === base);
  return preferSameExt(cands, extOf(ai.name));
}

function safeParse(text: string): StatusFile | null {
  try {
    return parseStatus(JSON.parse(text));
  } catch {
    return null;
  }
}

async function readCandidate(c: StatusCandidate): Promise<StatusFile | null> {
  const text = await readTextFile(c.handle, c.name);
  if (!text) return null;
  const parsed = safeParse(text);
  if (!parsed || statusJsonName(parsed.base) !== c.name) return null;
  return parsed;
}

export async function readHistory(status: StatusCandidate[]): Promise<Map<string, StatusFile>> {
  const out = new Map<string, StatusFile>();
  for (const c of status) {
    const parsed = await readCandidate(c);
    if (parsed) out.set(groupKeyOf({ dir: c.dir, base: parsed.base }), parsed);
  }
  return out;
}

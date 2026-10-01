// files.ts — sibling SVG naming, recovery discovery and no-overwrite atomic save.
// SVG output is staged, read back and validated before FileHandle.move commits it.

import { listChildNames, nameExists, probePath, writeFileNew, type DirHandleLike } from "../lib/fs";
import { sanitizeSvg } from "../lib/svgvalidate";

export interface SvgFileEntry {
  name: string;
  path: string;
  version: number;
  temporary: boolean;
}

interface SvgSaveResult {
  saved: boolean;
  path: string;
  version: number;
  recoverableTempPath: string | null;
}

interface AtomicSvgSaveInput {
  root: DirHandleLike;
  sourcePath: string;
  version: number;
  svg: string;
  requestId: string;
}

interface StagedSvgInput {
  parent: DirHandleLike;
  name: string;
  handle: Awaited<ReturnType<DirHandleLike["getFileHandle"]>>;
  expected: string;
  title: string;
}

export function svgFileName(sourceName: string, version: number): string {
  const base = stem(sourceName);
  return `${base}${version === 1 ? "" : `-v${version}`}.svg`;
}

export function parseSvgFileName(name: string, sourceName: string): number | null {
  const base = stem(sourceName);
  if (name === `${base}.svg`) return 1;
  const match = name.match(new RegExp(`^${escapeRegex(base)}-v([2-9]|[1-9]\\d+)\\.svg$`, "i"));
  return match ? Number(match[1]) : null;
}

export async function findSvgFiles(root: DirHandleLike, sourcePath: string): Promise<SvgFileEntry[]> {
  const parent = await sourceDirectory(root, sourcePath);
  if (!parent) return [];
  const names = await listChildNames(parent);
  return names.flatMap((name) => toSvgEntry(name, sourcePath));
}

export async function atomicSaveSvg(input: AtomicSvgSaveInput): Promise<SvgSaveResult> {
  const { root, sourcePath, version, svg, requestId } = input;
  const parent = await sourceDirectory(root, sourcePath);
  if (!parent) throw new Error("AI source folder is unavailable.");
  const sourceName = sourcePath.split("/").pop() ?? "source";
  const finalName = svgFileName(sourceName, version);
  if (await nameExists("file", parent, finalName)) throw new Error("SVG version already exists; refusing to overwrite it.");
  const tempName = `.${finalName}.tmp-${requestId.replace(/[^a-z0-9-]/gi, "")}`;
  const tempPath = join(sourcePath, tempName);
  await writeFileNew(parent, tempName, new Blob([svg], { type: "image/svg+xml" }));
  const temp = await parent.getFileHandle(tempName, { create: false });
  await verifyTempOrRemove({ parent, name: tempName, handle: temp, expected: svg, title: sourceName });
  if (!temp.move) return { saved: false, path: join(sourcePath, finalName), version, recoverableTempPath: tempPath };
  try {
    await temp.move(finalName);
    return { saved: true, path: join(sourcePath, finalName), version, recoverableTempPath: null };
  } catch {
    return { saved: false, path: join(sourcePath, finalName), version, recoverableTempPath: tempPath };
  }
}

export async function nextSvgVersion(root: DirHandleLike, sourcePath: string, known: number[]): Promise<number> {
  const files = await findSvgFiles(root, sourcePath);
  const maxFile = files.reduce((max, file) => Math.max(max, file.version), 0);
  return Math.max(maxFile, ...known, 0) + 1;
}

function toSvgEntry(name: string, sourcePath: string): SvgFileEntry[] {
  const sourceName = sourcePath.split("/").pop() ?? "";
  const version = parseSvgFileName(name, sourceName);
  if (version) return [{ name, path: join(sourcePath, name), version, temporary: false }];
  const temp = parseTempName(name, sourceName);
  return temp ? [{ name, path: join(sourcePath, name), version: temp, temporary: true }] : [];
}

function parseTempName(name: string, sourceName: string): number | null {
  const base = stem(sourceName);
  if (name.startsWith(`.${base}.svg.tmp-`)) return 1;
  const match = name.match(new RegExp(`^\\.${escapeRegex(base)}-v([2-9]|[1-9]\\d+)\\.svg\\.tmp-`, "i"));
  return match ? Number(match[1]) : null;
}

async function verifyTemp(handle: Awaited<ReturnType<DirHandleLike["getFileHandle"]>>, expected: string, title: string): Promise<void> {
  const back = await (await handle.getFile()).text();
  const checked = sanitizeSvg(back, title);
  if (!checked.ok || back !== expected) throw new Error("Staged SVG verification failed.");
}

async function verifyTempOrRemove(input: StagedSvgInput): Promise<void> {
  try { await verifyTemp(input.handle, input.expected, input.title); }
  catch (error) {
    try { await input.parent.removeEntry?.(input.name); } catch { /* no unverified output is promoted */ }
    throw error;
  }
}

async function sourceDirectory(root: DirHandleLike, sourcePath: string): Promise<DirHandleLike | null> {
  return probePath(root, sourcePath.split("/").slice(0, -1).join("/"));
}

function stem(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function join(path: string, name: string): string {
  return path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/${name}` : name;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

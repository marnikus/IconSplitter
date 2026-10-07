// exportio.ts — the export folder's IO: scanning a committed package and the
// atomic publication protocol (report R01/R24). Owns:
//
//   <pair>/export/current.json                     ← the ONLY commit pointer
//   <pair>/export/generations/<gen>/<base>.svg|jpg|eps
//   <pair>/export/generations/<gen>/record.json
//
// A generation is written WHOLE and immutable; only then is `current.json`
// replaced, so a failure anywhere in the pass leaves the previous generation
// and its pointer exactly as they were. The package is icon-scoped (the pair's
// base name), so two pairs can never overwrite each other's manifest (R24),
// and the last two generations are kept until the next commit proves them
// unnecessary. The FS API has no rename, so the pointer write IS the commit:
// one small file, one atomic close.
//
// Pure navigation over DirHandleLike, so the in-memory fakes exercise the real
// path (RULE 8).

import type { DirHandleLike } from "../lib/fs";
import { generationId, serializePointer, type ExportRecord } from "../lib/upexport";
import { readPointer } from "../lib/upexportread";
import type { ExportDirScan } from "./sources";

const EXPORT_DIR = "export";
const GENERATIONS_DIR = "generations";
const POINTER_NAME = "current.json";
const RECORD_NAME = "record.json";
/** The base's v1 marker — read only to report it, never to trust it. */
const LEGACY_RECORD_NAME = "export.json";
/** How many committed generations survive a commit (the last valid + current). */
const KEEP_GENERATIONS = 2;

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export interface StagedCommit {
  /** The generation this commit will publish. */
  readonly generation: string;
  /** Writes the (re)built outputs into the new generation. False = a write failed. */
  writeOutputs(files: OutputFile[]): Promise<boolean>;
  /** Copies a kept output from the last valid generation. False = not available. */
  copyOutput(name: string): Promise<boolean>;
  /** Reads a committed output — the re-embed path's source of pixels. */
  readOutput(name: string): Promise<Uint8Array | null>;
  /** Publishes: the record, then the pointer. The pointer write IS the commit. */
  commitRecord(record: ExportRecord): Promise<boolean>;
  /** Best-effort cleanup of generations older than the kept window. */
  pruneOldGenerations(): Promise<void>;
}

/** Reads one pair's export folder: the pointer, the generation and its files. */
export async function scanExportDir(root: DirHandleLike, pairDirPath: string): Promise<ExportDirScan> {
  const exportDir = await exportRoot(root, pairDirPath, false);
  if (exportDir === null) return emptyScan();
  const pointerText = await readFile(exportDir, POINTER_NAME);
  if (pointerText === null) return await legacyScan(exportDir);
  const pointer = readPointer(pointerText);
  if (pointer === null) return { exportJson: null, outputs: [], generation: null, legacy: false, corruptPointer: true };
  const genDir = await childDir(exportDir, GENERATIONS_DIR, false);
  const dir = genDir === null ? null : await childDir(genDir, pointer.generation, false);
  const outputs = dir === null ? [] : await listNames(dir);
  return {
    exportJson: JSON.stringify(pointer.record),
    outputs: outputs.filter((n) => n !== RECORD_NAME).sort(),
    generation: pointer.generation,
    legacy: false,
    corruptPointer: false,
  };
}

/**
 * Opens the staged commit for a NEW generation: nothing is written until the
 * first output lands inside it, and the pointer keeps naming the old one until
 * commitRecord says otherwise.
 */
export async function openExportDir(root: DirHandleLike, pairDirPath: string): Promise<StagedCommit | null> {
  const exportDir = await exportRoot(root, pairDirPath, true);
  if (exportDir === null) return null;
  const generations = await childDir(exportDir, GENERATIONS_DIR, true);
  if (generations === null) return null;
  return stagedCommit(exportDir, generations);
}

/** One staged commit over an opened `<pair>/export` tree (R01's whole policy). */
async function stagedCommit(exportDir: DirHandleLike, generations: DirHandleLike): Promise<StagedCommit> {
  const taken = await listDirNames(generations);
  const generation = generationId(new Date().toISOString(), taken);
  const box: DirBox = { dir: null };
  const writeOutputs = (files: OutputFile[]) => writeGeneration(box, generations, generation, files);
  const from = { generations, exportDir, taken };
  return {
    generation,
    writeOutputs,
    copyOutput: (name) => carryOutput(from, name, writeOutputs),
    readOutput: (name) => readOutputOf(from, name),
    commitRecord: (record) => publishRecord(box.dir, exportDir, generation, record),
    pruneOldGenerations: () => prune(generations, generation, taken),
  };
}

/** The generation directory, created lazily on the first write. */
interface DirBox {
  dir: DirHandleLike | null;
}

async function writeGeneration(
  box: DirBox, generations: DirHandleLike, generation: string, files: OutputFile[],
): Promise<boolean> {
  if (box.dir === null) {
    box.dir = await childDir(generations, generation, true);
    if (box.dir === null) return false;
  }
  return await writeAll(box.dir, files);
}

/** The tree a commit reads kept bytes from: the generations folder + pointer. */
interface FromBox {
  generations: DirHandleLike;
  exportDir: DirHandleLike;
  taken: readonly string[];
}

/** Carries one kept output from the last valid generation into this one. */
async function carryOutput(
  from: FromBox, name: string, write: (files: OutputFile[]) => Promise<boolean>,
): Promise<boolean> {
  const bytes = await readOutputOf(from, name);
  return bytes === null ? false : await write([{ name, bytes }]);
}

async function readOutputOf(from: FromBox, name: string): Promise<Uint8Array | null> {
  const dir = await lastGenerationDir(from.generations, from.exportDir, from.taken);
  return dir === null ? null : await readBytes(dir, name);
}

/** The record, then the pointer: the pointer write IS the commit (R01). */
async function publishRecord(
  dir: DirHandleLike | null, exportDir: DirHandleLike, generation: string, record: ExportRecord,
): Promise<boolean> {
  if (dir === null || record.generation !== generation) return false;
  if (!(await writeText(dir, RECORD_NAME, JSON.stringify(record)))) return false;
  return await writeText(exportDir, POINTER_NAME, serializePointer(record));
}

/** The generation the pointer names (the last valid one), or null. */
async function lastGenerationDir(
  generations: DirHandleLike, exportDir: DirHandleLike, taken: readonly string[],
): Promise<DirHandleLike | null> {
  const pointerText = await readFile(exportDir, POINTER_NAME);
  const pointer = pointerText === null ? null : readPointer(pointerText);
  const name = pointer?.generation ?? currentGenerationFallback(taken);
  return name === null ? null : childDir(generations, name, false);
}

/** Without a pointer (legacy folder) the newest generation directory is the best guess. */
function currentGenerationFallback(taken: readonly string[]): string | null {
  const sorted = [...taken].sort();
  return sorted.length === 0 ? null : sorted[sorted.length - 1];
}

async function prune(generations: DirHandleLike, keep: string, taken: readonly string[]): Promise<void> {
  const sorted = [...taken, keep].sort().reverse();
  for (const name of sorted.slice(KEEP_GENERATIONS)) {
    try {
      await generations.removeEntry?.(name, { recursive: true });
    } catch {
      // Cleanup is best-effort: an undeletable old generation never fails a commit.
    }
  }
}

/** The v1 layout: one export.json beside the output files. Reported, not trusted. */
async function legacyScan(exportDir: DirHandleLike): Promise<ExportDirScan> {
  const names = await listNames(exportDir);
  const legacy = await readFile(exportDir, LEGACY_RECORD_NAME);
  if (legacy === null && names.length === 0) return emptyScan();
  return { exportJson: null, outputs: names.sort(), generation: null, legacy: true, corruptPointer: false };
}

function emptyScan(): ExportDirScan {
  return { exportJson: null, outputs: [], generation: null, legacy: false, corruptPointer: false };
}

async function exportRoot(root: DirHandleLike, pairDirPath: string, create: boolean): Promise<DirHandleLike | null> {
  const dir = await dirAt(root, pairDirPath, create);
  return dir === null ? null : await childDir(dir, EXPORT_DIR, create);
}

async function dirAt(root: DirHandleLike, path: string, create: boolean): Promise<DirHandleLike | null> {
  let node = root;
  for (const part of path.split("/").filter(Boolean)) {
    const next = await childDir(node, part, create);
    if (next === null) return null;
    node = next;
  }
  return node;
}

async function childDir(dir: DirHandleLike, name: string, create: boolean): Promise<DirHandleLike | null> {
  try {
    return await dir.getDirectoryHandle(name, { create });
  } catch {
    return null;
  }
}

async function listNames(dir: DirHandleLike): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) if (handle.kind === "file") names.push(name);
  return names;
}

/** Directory names only — the generation ids a new commit must not collide with. */
async function listDirNames(dir: DirHandleLike): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) if (handle.kind === "directory") names.push(name);
  return names;
}

async function writeAll(dir: DirHandleLike, files: OutputFile[]): Promise<boolean> {
  for (const file of files) {
    if (!(await writeBytes(dir, file.name, file.bytes))) return false;
  }
  return true;
}

async function readFile(dir: DirHandleLike, name: string): Promise<string | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function readBytes(dir: DirHandleLike, name: string): Promise<Uint8Array | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeBytes(dir: DirHandleLike, name: string, bytes: Uint8Array): Promise<boolean> {
  return await write(dir, name, new Uint8Array(bytes));
}

async function writeText(dir: DirHandleLike, name: string, text: string): Promise<boolean> {
  return await write(dir, name, text);
}

async function write(dir: DirHandleLike, name: string, payload: BlobPart): Promise<boolean> {
  try {
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(new Blob([payload]));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

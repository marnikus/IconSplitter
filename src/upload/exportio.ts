// exportio.ts — the export/ folder IO (design §9). Owns: scanning a pair's
// export folder for the discovery state, and the STAGED COMMIT — outputs
// first (each FSA write an atomic swap on close), export.json LAST, because
// the record is the commit marker. A failure before the record write leaves
// the previous record describing the last valid state; a corrupt or missing
// record never deletes output files. Pure navigation over DirHandleLike, so
// the in-memory fakes exercise the real path (RULE 8).

import type { DirHandleLike } from "../lib/fs";
import { serializeExportRecord, type ExportRecord } from "../lib/upexport";
import type { ExportDirScan } from "./sources";

const EXPORT_DIR = "export";
const RECORD_NAME = "export.json";

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export interface StagedCommit {
  /** Writes the outputs (not export.json). False = a write failed mid-pass. */
  writeOutputs(files: OutputFile[]): Promise<boolean>;
  /** Reads a written output back — the validate stage's re-read. */
  readOutput(name: string): Promise<Uint8Array | null>;
  /** Writes export.json — the LAST write, i.e. the commit itself. */
  commitRecord(record: ExportRecord): Promise<boolean>;
}

/** The pair's export folder, or null when it does not exist (never created). */
export async function scanExportDir(root: DirHandleLike, pairDirPath: string): Promise<ExportDirScan> {
  const dir = await dirAt(root, pairDirPath, false);
  const exportDir = dir === null ? null : await childDir(dir, EXPORT_DIR, false);
  if (exportDir === null) return { exportJson: null, outputs: [] };
  const outputs: string[] = [];
  let recordText: string | null = null;
  for await (const [name, handle] of exportDir.entries()) {
    if (handle.kind !== "file") continue;
    if (name === RECORD_NAME) recordText = await readFile(exportDir, name);
    else outputs.push(name);
  }
  return { exportJson: recordText, outputs: outputs.sort() };
}

/** Opens the staged commit, creating the export folder on first export. */
export async function openExportDir(root: DirHandleLike, pairDirPath: string): Promise<StagedCommit | null> {
  const dir = await dirAt(root, pairDirPath, true);
  const exportDir = dir === null ? null : await childDir(dir, EXPORT_DIR, true);
  if (exportDir === null) return null;
  return {
    writeOutputs: (files) => writeAll(exportDir, files),
    readOutput: (name) => readBytes(exportDir, name),
    commitRecord: (record) => writeText(exportDir, RECORD_NAME, serializeExportRecord(record)),
  };
}

async function writeAll(dir: DirHandleLike, files: OutputFile[]): Promise<boolean> {
  for (const file of files) {
    if (!(await writeBytes(dir, file.name, file.bytes))) return false;
  }
  return true;
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
  try {
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(new Blob([new Uint8Array(bytes)]));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function writeText(dir: DirHandleLike, name: string, text: string): Promise<boolean> {
  try {
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(new Blob([text]));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

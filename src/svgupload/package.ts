// package.ts — writing (and reading) one icon's export folder (design §15/§16).
// The rules encoded here are the ones a failure must not break:
//   · every output shares ONE base name and the approved source version;
//   · files are written through a staging folder and only then published, so a
//     reader never sees a half-written package;
//   · the last valid package survives a failure — a failed rebuild leaves the
//     old files and the old export.json exactly as they were;
//   · re-export replaces the outputs of this icon only; it touches no other
//     icon's folder, no pair file and no source SVG.
// A corrupt or missing export.json is reported, never treated as "no package",
// and never causes a delete.

import type { DirHandleLike } from "../lib/fs";
import { ensureDirPath, listChildNames, probePath, tryGetFile, writeFileOverwrite } from "../lib/fs";
import { parseExportRecordText, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/svgupload/exportjson";
import { hashBytes } from "../lib/svgupload/exportjson";

export const EXPORT_DIR = "export";
export const RECORD_NAME = "export.json";
export const STAGE_DIR = ".export-staging";

export interface PackageFile {
  name: string;
  bytes: Uint8Array;
}

export interface PackageArgs {
  /** The pair folder (relative to the root) the export belongs to. */
  dirPath: string;
  /** `<icon base>` — the base name every output shares. */
  base: string;
  svg: PackageFile | null;
  jpg: PackageFile | null;
  eps: PackageFile | null;
  record: ExportRecord;
}

export interface PublishOut {
  ok: boolean;
  /** Files written this time, by name. */
  written: string[];
  errors: string[];
}

/** The export folder path for a pair folder. */
export function exportDirOf(dirPath: string): string {
  return dirPath === "" ? EXPORT_DIR : `${dirPath}/${EXPORT_DIR}`;
}

/** The three file names of one package — same base, one format each. */
export function packageNames(base: string): { svg: string; jpg: string; eps: string; record: string } {
  return { svg: `${base}.svg`, jpg: `${base}.jpg`, eps: `${base}.eps`, record: RECORD_NAME };
}

/**
 * Publishes a package atomically: every byte goes into the staging folder first,
 * then the live folder receives the files, and export.json is written LAST so a
 * reader that sees a record sees the complete package beside it.
 */
export async function publishPackage(root: DirHandleLike, args: PackageArgs): Promise<PublishOut> {
  try {
    const dir = await ensureDirPath(root, exportDirOf(args.dirPath));
    const stage = await stageOf(dir);
    await stageAll(stage, packageNames(args.base), args);
    const written = await publishFiles(dir, stage, args);
    await writeRecord(dir, args.record);
    await clearStage(dir);
    return { ok: true, written: [...written, RECORD_NAME], errors: [] };
  } catch (error) {
    // Nothing else is touched here: the previous package keeps its files and its
    // record, which is exactly what "the last valid package survives" means.
    return { ok: false, written: [], errors: [messageOf(error)] };
  }
}

/** Copies every staged file into the live folder, in output order. */
async function publishFiles(dir: DirHandleLike, stage: DirHandleLike, args: PackageArgs): Promise<string[]> {
  const written: string[] = [];
  for (const file of filesOf(packageNames(args.base), args)) {
    await copyWithin(dir, stage, file.name);
    written.push(file.name);
  }
  return written;
}

/** Removes the staging folder, or at worst every file inside it. */
async function clearStage(dir: DirHandleLike): Promise<void> {
  const remove = dir.removeEntry?.bind(dir);
  if (remove === undefined) return;
  try {
    await remove(STAGE_DIR, { recursive: true });
    return;
  } catch {
    // fall through: some engines refuse a recursive remove on a directory
  }
  const stage = await probePath(dir, STAGE_DIR);
  if (stage === null) return;
  await clearEntries(stage);
  try {
    await remove(STAGE_DIR);
  } catch {
    // nothing more to do — an empty staging folder is harmless
  }
}

/** Empties a folder file by file; a handle we cannot delete is not fatal. */
async function clearEntries(stage: DirHandleLike): Promise<void> {
  const remove = stage.removeEntry?.bind(stage);
  if (remove === undefined) return;
  for (const name of await listChildNames(stage)) {
    try {
      await remove(name);
    } catch {
      // the next publish replaces it anyway
    }
  }
}

/** The staging folder inside the icon's OWN export folder, emptied first. */
async function stageOf(dir: DirHandleLike): Promise<DirHandleLike> {
  const stage = await ensureDirPath(dir, STAGE_DIR);
  await clearEntries(stage); // whatever a crashed run left; the writes below replace the rest
  return stage;
}

function filesOf(names: ReturnType<typeof packageNames>, args: PackageArgs): PackageFile[] {
  const out: PackageFile[] = [];
  if (args.svg !== null) out.push({ name: names.svg, bytes: args.svg.bytes });
  if (args.jpg !== null) out.push({ name: names.jpg, bytes: args.jpg.bytes });
  if (args.eps !== null) out.push({ name: names.eps, bytes: args.eps.bytes });
  return out;
}

/** Staging writes are ordinary creates; the live copy is what a reader sees. */
async function stageAll(stage: DirHandleLike, names: ReturnType<typeof packageNames>, args: PackageArgs): Promise<void> {
  for (const file of filesOf(names, args)) await writeFileOverwrite(stage, file.name, blobOf(file.bytes));
  await writeFileOverwrite(stage, names.record, blobOf(new TextEncoder().encode(serializeExportRecord(args.record))));
}

async function copyWithin(dir: DirHandleLike, stage: DirHandleLike, name: string): Promise<void> {
  const handle = await tryGetFile(stage, name);
  if (handle === null) throw new Error(`The staged file ${name} is missing.`);
  const file = await handle.getFile();
  await writeFileOverwrite(dir, name, file); // app-owned output: replace, never stack
}

/** export.json is written last, and only when it parses back as this schema. */
async function writeRecord(dir: DirHandleLike, record: ExportRecord): Promise<void> {
  const text = serializeExportRecord(record);
  const parsed = parseExportRecordText(text);
  if (!parsed.ok) throw new Error(`The export record did not validate: ${parsed.errors.join(" ")}`);
  await writeFileOverwrite(dir, RECORD_NAME, blobOf(new TextEncoder().encode(text)));
}

export interface PackageRead {
  /** The folder exists (with or without a record). */
  exists: boolean;
  record: ExportRecord | null;
  /** Set when export.json exists but could not be read — outputs are untouched. */
  corrupt: string | null;
  /** Which output files are really on disk right now. */
  present: { svg: boolean; jpg: boolean; eps: boolean };
}

/** What an icon's export folder currently holds — the row's status source. */
export async function readPackage(root: DirHandleLike, dirPath: string, base: string): Promise<PackageRead> {
  const dir = await probePath(root, exportDirOf(dirPath));
  const empty: PackageRead = { exists: false, record: null, corrupt: null, present: { svg: false, jpg: false, eps: false } };
  if (dir === null) return empty;
  const names = packageNames(base);
  const present = {
    svg: (await tryGetFile(dir, names.svg)) !== null,
    jpg: (await tryGetFile(dir, names.jpg)) !== null,
    eps: (await tryGetFile(dir, names.eps)) !== null,
  };
  const recordFile = await tryGetFile(dir, RECORD_NAME);
  if (recordFile === null) return { exists: true, record: null, corrupt: null, present };
  const text = await (await recordFile.getFile()).text();
  const parsed = parseExportRecordText(text);
  if (!parsed.ok) return { exists: true, record: null, corrupt: parsed.errors.join(" "), present };
  return { exists: true, record: parsed.record, corrupt: null, present };
}

/** The output records a successful publish writes — bytes and hashes included. */
export function outputRecord(format: OutputRecord["format"], name: string, bytes: Uint8Array, extra: Partial<OutputRecord> = {}): OutputRecord {
  return { format, path: name, bytes: bytes.length, hash: hashBytes(bytes), ...extra };
}

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

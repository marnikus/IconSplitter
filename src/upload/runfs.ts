// runfs.ts — the file system side of one icon's export (RULE 23). Owns: finding
// the icon's `export/` folder, reading what is already there, writing the new
// package into a staging folder inside it, copying the staged files into place
// in a fixed order, and cleaning up.
//
// Why staging: a disk that fills up, a permission that disappears or a crash
// mid-write must leave the LAST VALID package readable. Every staged file is
// written first, `export.json` is copied last, and a failure before that leaves
// the previous package exactly as it was.

import {
  ensureDirPath, tryGetFile, type DirHandleLike, type FileHandleLike,
} from "../lib/fs";
import { RECORD_NAME, parseRecord, type ExportRecord } from "../lib/uploadrecord";

export const EXPORT_DIR = "export";
export const STAGING_DIR = ".staging";

/** `<pair folder>/export`, created on demand. */
export function exportDir(root: DirHandleLike, dirPath: string): Promise<DirHandleLike> {
  const rel = dirPath === "" ? EXPORT_DIR : `${dirPath}/${EXPORT_DIR}`;
  return ensureDirPath(root, rel);
}

/** The staging area inside the export folder — never a place a consumer reads. */
export function stagingDir(root: DirHandleLike, dirPath: string): Promise<DirHandleLike> {
  const rel = dirPath === "" ? `${EXPORT_DIR}/${STAGING_DIR}` : `${dirPath}/${EXPORT_DIR}/${STAGING_DIR}`;
  return ensureDirPath(root, rel);
}

export async function readBytes(dir: DirHandleLike, name: string): Promise<Uint8Array | null> {
  const handle = await tryGetFile(dir, name).catch(() => null);
  if (handle === null) return null;
  try {
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  } catch {
    return null; // unreadable is reported as missing, never as content
  }
}

export async function readText(dir: DirHandleLike, name: string): Promise<string | null> {
  const bytes = await readBytes(dir, name);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** The record the icon already has; null when absent, unreadable or corrupt. */
export async function readRecord(dir: DirHandleLike): Promise<ExportRecord | null> {
  const text = await readText(dir, RECORD_NAME);
  if (text === null) return null;
  try {
    return parseRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

const OUTPUT_NAMES: Record<"svg" | "jpeg" | "eps", (stem: string) => string> = {
  svg: (stem) => `${stem}.svg`,
  jpeg: (stem) => `${stem}.jpg`,
  eps: (stem) => `${stem}.eps`,
};

/**
 * The bytes of the outputs a previous run left behind, keyed by format, so the
 * pipeline can prove a carried-over file still hashes right before reusing it.
 */
export async function readExisting(
  dir: DirHandleLike,
  stem: string,
  record: ExportRecord | null,
): Promise<Partial<Record<"svg" | "jpeg" | "eps", Uint8Array>>> {
  const out: Partial<Record<"svg" | "jpeg" | "eps", Uint8Array>> = {};
  for (const file of record?.outputs ?? []) {
    const bytes = await readBytes(dir, file.name);
    if (bytes !== null) out[file.format] = bytes;
  }
  // A record that lost its SVO row still has the file: read the standard name.
  if (out.svg === undefined) {
    const bytes = await readBytes(dir, OUTPUT_NAMES.svg(stem));
    if (bytes !== null) out.svg = bytes;
  }
  return out;
}

export interface StagedWriter {
  /** Writes one file of the new package into the staging folder. */
  write: (name: string, data: Uint8Array | string) => Promise<void>;
  /** Copies every staged name into the export folder, the record last. */
  commit: (names: readonly string[]) => Promise<void>;
  /** Removes staged files — the previous package is untouched. */
  discard: () => Promise<void>;
}

/**
 * One writer per icon. `commit` copies staged files in the given order, with the
 * record last, so a reader never sees a record describing files that are not
 * there yet.
 */
export function stagedWriter(target: DirHandleLike, staging: DirHandleLike): StagedWriter {
  return {
    write: (name, data) => writeStaged(staging, name, data),
    commit: async (names) => {
      for (const name of orderForCommit(names)) await copyOver(staging, target, name);
      await cleanup(staging);
    },
    discard: () => cleanup(staging),
  };
}

/** The record goes last: until it moves, the old package is the true one. */
export function orderForCommit(names: readonly string[]): string[] {
  return [...names.filter((name) => name !== RECORD_NAME), ...names.filter((name) => name === RECORD_NAME)];
}

async function writeStaged(dir: DirHandleLike, name: string, data: Uint8Array | string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(typeof data === "string" ? new Blob([data]) : new Blob([data as BlobPart]));
  await writable.close();
}

async function copyOver(from: DirHandleLike, to: DirHandleLike, name: string): Promise<void> {
  const source = await tryGetFile(from, name);
  if (source === null) throw new Error(`the staged file ${name} disappeared before it was published`);
  const bytes = new Uint8Array(await (await source.getFile()).arrayBuffer());
  await writeStaged(to, name, bytes);
}

/** Staging is ours: clearing it never touches a published file. */
export async function cleanup(staging: DirHandleLike): Promise<void> {
  if (staging.removeEntry === undefined) return;
  for (const name of await childNames(staging)) {
    await staging.removeEntry(name).catch(() => undefined);
  }
}

async function childNames(dir: DirHandleLike): Promise<string[]> {
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names;
}

/** Reads the approved SVG the row points at, or null with the reason. */
export async function readApprovedSvg(
  root: DirHandleLike,
  relPath: string,
): Promise<{ code: string; handle: FileHandleLike } | null> {
  const segments = relPath.split("/").filter((part) => part !== "");
  let dir = root;
  for (const segment of segments.slice(0, -1)) {
    try {
      dir = await dir.getDirectoryHandle(segment);
    } catch {
      return null;
    }
  }
  const name = segments.at(-1);
  if (name === undefined) return null;
  const handle = await tryGetFile(dir, name).catch(() => null);
  if (handle === null) return null;
  try {
    return { code: await (await handle.getFile()).text(), handle };
  } catch {
    return null;
  }
}

// exportcommit.ts — the atomic commit stage of the export pipeline (design
// §3.2). Every output is written tmp → read back → verified → overwrite →
// cleanup (RULE 23); `export.json` is written LAST and is the commit marker,
// so a crash mid-commit leaves the last valid package in place. The record's
// outputs/status/timestamps are filled here, from what was actually written.

import { ensureDirPath, listChildNames, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { readJpegDimensions, verifyJpeg } from "../lib/upload/jpeg";
import { verifyEps } from "../lib/upload/eps";
import { sha256Hex } from "../lib/upload/hash";
import { parseExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import type { IconMetadata } from "../lib/upload/meta";
import { readBytesAt } from "./runexport";

export interface CommitValidation {
  svg: boolean; jpeg: boolean; eps: boolean; json: boolean; readback: boolean;
}

export interface CommitExportInput {
  root: DirHandleLike;
  exportDir: string;
  /** The artifact name this commit writes (the icon's own name, see `stemOf`). */
  stem: string;
  /**
   * The files the PREVIOUS record named as this icon's package. Their names are
   * superseded whenever the naming rule changes (`fog_AI.*` -> `fog.*`), and a
   * package whose files were renamed in place would otherwise leave a second,
   * stale copy of the same icon in `export/` (2026-10-08). Only paths inside
   * this icon's own export folder are ever considered.
   */
  previous?: readonly string[];
  svgOut: string | null;
  jpeg: Uint8Array | null;
  epsText: string | null;
  metadata: IconMetadata | null;
  /** The dimensions the committed JPEG must decode to. */
  jpegExpected: { width: number; height: number };
  /** The record, pre-assembled; outputs/status/timestamps are filled here. */
  record: ExportRecord;
  partial: boolean;
  epsFailure: string | null;
  validation: CommitValidation;
  now: string;
}

export interface CommitExportOutput {
  outputs: { svg: string | null; jpg: string | null; eps: string | null };
  record: ExportRecord;
  /** The superseded files that were removed — reported, never silent. */
  replaced: string[];
}

/** Commits every rebuilt output, then export.json. Throws on any verify failure. */
export async function commitExport(input: CommitExportInput): Promise<CommitExportOutput> {
  const dir = await ensureDirPath(input.root, input.exportDir);
  const outputs: CommitExportOutput["outputs"] = { svg: null, jpg: null, eps: null };
  if (input.svgOut !== null) {
    await commitFile(dir, `${input.stem}.svg`, encode(input.svgOut), (back) => svgParses(decode(back)));
    outputs.svg = `${input.stem}.svg`;
  }
  if (input.jpeg !== null) {
    await commitFile(dir, `${input.stem}.jpg`, input.jpeg, (back) => jpegVerifies(back, input));
    outputs.jpg = `${input.stem}.jpg`;
  }
  if (input.epsText !== null) {
    await commitFile(dir, `${input.stem}.eps`, encode(input.epsText), (back) => verifyEps(decode(back)).ok);
    outputs.eps = `${input.stem}.eps`;
  }
  const replaced = await dropSuperseded(input, dir);
  return { outputs, record: await writeRecord(input, dir, outputs, replaced), replaced };
}

/**
 * Removes the previous record's own package files once the new ones are
 * committed and verified — and only the ones whose NAME the current rule no
 * longer uses, so a selective re-export (a JPEG that had to be re-rendered,
 * say) never touches the files it did not rewrite. What counts as "in use" is
 * the current artifact name itself, never the subset rebuilt in this run.
 *
 * This is the app's own bookkeeping inside the icon's own export folder: no
 * file the record does not name is ever touched (T28's rule), and the new
 * package is already on disk before anything is removed, so a crash cannot
 * cost the user their export.
 */
async function dropSuperseded(input: CommitExportInput, dir: DirHandleLike): Promise<string[]> {
  const present = new Set(await listChildNames(dir));
  const removed: string[] = [];
  for (const path of input.previous ?? []) {
    const name = supersededName(path, input.exportDir, input.stem, present);
    if (name === null) continue;
    try {
      await dir.removeEntry?.(name);
      removed.push(path);
    } catch {
      // a file the browser refuses to remove is left in place, never hidden
    }
  }
  return removed;
}

/**
 * The name to remove, or null when nothing should be. Outside this icon's own
 * export folder, or already the current name: never. And — the rule that keeps
 * the migration from ever costing a package — only when the CURRENT artifact of
 * that kind is really on disk: this run wrote it, or an earlier run under the
 * new name did. An old-named file whose replacement was not written is the only
 * copy of that output, so it stays.
 */
function supersededName(
  path: string, exportDir: string, stem: string, present: ReadonlySet<string>,
): string | null {
  if (!path.startsWith(`${exportDir}/`)) return null;
  const name = path.slice(exportDir.length + 1);
  if (name === "" || name.includes("/")) return null;
  const current = `${stem}.${extOf(name)}`;
  return name === current || !present.has(current) ? null : name;
}

/** The extension a name carries, lowercased (`fog_AI.EPS` → `eps`). */
function extOf(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

/** Fills outputs/status/timestamps from what was written, then writes export.json. */
async function writeRecord(
  input: CommitExportInput, dir: DirHandleLike, outputs: CommitExportOutput["outputs"], replaced: readonly string[],
): Promise<ExportRecord> {
  const kept = pruneRemoved(input.record.outputs, replaced, outputs);
  input.record.outputs = {
    svg: outputs.svg === null ? kept.svg : await outputRecord(input, outputs.svg),
    jpg: outputs.jpg === null ? kept.jpg : await outputRecord(input, outputs.jpg),
    eps: outputs.eps === null ? kept.eps : await outputRecord(input, outputs.eps),
  };
  input.record.stage = "committed";
  input.record.status = input.partial ? "partial" : "processed";
  input.record.validation = input.validation;
  input.record.error = input.partial ? (input.epsFailure ?? "the EPS stage failed") : null;
  input.record.recovery = "none";
  input.record.timestamps.committedAt = input.now;
  const json = serializeExportRecord(input.record);
  await commitFile(dir, "export.json", encode(json), (back) => {
    try {
      return parseExportRecord(JSON.parse(decode(back))) !== null;
    } catch {
      return false;
    }
  });
  return input.record;
}

/**
 * The previous outputs, minus any file this commit removed and did not rewrite.
 * A record that keeps naming a file the commit just deleted is a lie the UI
 * would repeat (T28: nothing is silently overwritten — or silently claimed).
 */
function pruneRemoved(
  prev: ExportRecord["outputs"], replaced: readonly string[], written: CommitExportOutput["outputs"],
): ExportRecord["outputs"] {
  const gone = new Set(replaced);
  return {
    svg: keepOrNull(prev.svg, gone, written.svg),
    jpg: keepOrNull(prev.jpg, gone, written.jpg),
    eps: keepOrNull(prev.eps, gone, written.eps),
  };
}

/** One entry: null when it was removed and nothing took its place. */
function keepOrNull(out: OutputRecord | null, gone: ReadonlySet<string>, written: string | null): OutputRecord | null {
  return out !== null && gone.has(out.path) && written === null ? null : out;
}

/** The tmp → verify → overwrite → cleanup protocol (RULE 23, atomic delivery). */
async function commitFile(dir: DirHandleLike, name: string, content: Uint8Array, verify: (back: Uint8Array) => boolean): Promise<void> {
  const tmp = `${name}.tmp`;
  const fh = await dir.getFileHandle(tmp, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([content as BlobPart]));
  await w.close();
  const back = new Uint8Array(await (await fh.getFile()).arrayBuffer());
  if (!verify(back)) throw new Error(`tmp verify failed for ${name}`);
  await writeFileOverwrite(dir, name, new Blob([content as BlobPart]));
  try {
    await dir.removeEntry?.(tmp);
  } catch {
    // a leftover tmp is harmless — the next commit overwrites it
  }
}

async function outputRecord(input: CommitExportInput, name: string) {
  const bytes = await readBytesAt(input.root, `${input.exportDir}/${name}`);
  return {
    path: `${input.exportDir}/${name}`,
    bytes: bytes?.length ?? 0,
    hash: bytes === null ? "" : `sha256:${await sha256Hex(bytes)}`,
  };
}

function jpegVerifies(back: Uint8Array, input: CommitExportInput): boolean {
  if (input.metadata === null) {
    return back.length > 4 && back[0] === 0xff && back[1] === 0xd8
      && dimsOf(back)?.width === input.jpegExpected.width
      && dimsOf(back)?.height === input.jpegExpected.height;
  }
  return verifyJpeg(back, { ...input.jpegExpected, metadata: input.metadata }).ok;
}

function dimsOf(jpeg: Uint8Array): { width: number; height: number } | null {
  return readJpegDimensions(jpeg);
}

function svgParses(svg: string): boolean {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return doc.querySelector("parsererror") === null && doc.documentElement?.nodeName.toLowerCase() === "svg";
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

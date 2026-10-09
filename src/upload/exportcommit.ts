// exportcommit.ts — the atomic commit stage of the export pipeline (design
// §3.2). Every output is written tmp → read back → verified → overwrite →
// cleanup (RULE 23); `export.json` is written LAST and is the commit marker,
// so a crash mid-commit leaves the last valid package in place. The record's
// outputs/status/timestamps are filled here, from what was actually written.

import { ensureDirPath, readBytesAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { readJpegDimensions, verifyJpeg } from "../lib/upload/jpeg";
import { verifyEpsDocument } from "../lib/upload/eps";
import { verifyEpsMetadata } from "../lib/upload/epsmetadata";
import { sha256Hex } from "../lib/upload/hash";
import { parseExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import type { IconMetadata } from "../lib/upload/meta";
import { sweepSuperseded } from "./exportsweep";

export interface CommitValidation {
  svg: boolean; jpeg: boolean; eps: boolean; json: boolean; readback: boolean;
}

export interface CommitExportInput {
  root: DirHandleLike;
  exportDir: string;
  /**
   * The artifact name this commit writes (the icon's own name, see `stemOf`).
   * The folder's superseded artifacts — whatever the previous `export.json`
   * named, and any orphan the app lost track of — are swept after the write,
   * by `exportsweep.ts`.
   */
  stem: string;
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
  // The new files are written and verified FIRST; only then may anything go
  // (RULE 23: the sweep can never cost the user their only copy).
  if (input.svgOut !== null) {
    await commitFile(dir, `${input.stem}.svg`, encode(input.svgOut), (back) => svgParses(decode(back)));
    outputs.svg = `${input.stem}.svg`;
  }
  if (input.jpeg !== null) {
    await commitFile(dir, `${input.stem}.jpg`, input.jpeg, (back) => jpegVerifies(back, input));
    outputs.jpg = `${input.stem}.jpg`;
  }
  if (input.epsText !== null) {
    await commitFile(dir, `${input.stem}.eps`, encode(input.epsText), (back) => epsVerifies(back, input));
    outputs.eps = `${input.stem}.eps`;
  }
  const named = previousNames(input);
  const removed = await sweepSuperseded(dir, input.stem, named);
  const replaced = removed.map((n) => `${input.exportDir}/${n}`);
  return { outputs, record: await writeRecord(input, dir, outputs, replaced), replaced };
}

/** The file names the previous record claims, rebased onto this export folder. */
function previousNames(input: CommitExportInput): Set<string> {
  const prefix = `${input.exportDir}/`;
  const outs = [input.record.outputs.svg, input.record.outputs.jpg, input.record.outputs.eps];
  return new Set(outs.flatMap((o) => (o === null || !o.path.startsWith(prefix) ? [] : [o.path.slice(prefix.length)])));
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

function epsVerifies(back: Uint8Array, input: CommitExportInput): boolean {
  const eps = decode(back);
  return verifyEpsDocument(eps).ok && (input.metadata === null || verifyEpsMetadata(eps, input.metadata));
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

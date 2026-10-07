// exportcommit.ts — the atomic commit stage of the export pipeline (design
// §3.2). Every output is written tmp → read back → verified → overwrite →
// cleanup (RULE 23); `export.json` is written LAST and is the commit marker,
// so a crash mid-commit leaves the last valid package in place. The record's
// outputs/status/timestamps are filled here, from what was actually written.

import { ensureDirPath, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { readJpegDimensions, verifyJpeg } from "../lib/uploadjpeg";
import { verifyEps } from "../lib/uploadeps";
import { sha256Hex } from "../lib/hash";
import { parseExportRecord, serializeExportRecord, type ExportRecord } from "../lib/uploadexport";
import type { IconMetadata } from "../lib/uploadmeta";
import { readBytesAt } from "./runexport";

export interface CommitValidation {
  svg: boolean; jpeg: boolean; eps: boolean; json: boolean; readback: boolean;
}

export interface CommitExportInput {
  root: DirHandleLike;
  exportDir: string;
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
  return { outputs, record: await writeRecord(input, dir, outputs) };
}

/** Fills outputs/status/timestamps from what was written, then writes export.json. */
async function writeRecord(input: CommitExportInput, dir: DirHandleLike, outputs: CommitExportOutput["outputs"]): Promise<ExportRecord> {
  input.record.outputs = {
    svg: outputs.svg === null ? input.record.outputs.svg : await outputRecord(input, outputs.svg),
    jpg: outputs.jpg === null ? input.record.outputs.jpg : await outputRecord(input, outputs.jpg),
    eps: outputs.eps === null ? input.record.outputs.eps : await outputRecord(input, outputs.eps),
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

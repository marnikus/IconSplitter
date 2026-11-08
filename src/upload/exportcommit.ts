import { outputFormats } from "../lib/upload/formats";
// exportcommit.ts — the atomic commit stage of the export pipeline (design
// §3.2). Every output is written tmp → read back → verified → overwrite →
// cleanup (RULE 23); `export.json` is written LAST and is the commit marker,
// so a crash mid-commit leaves the last valid package in place. The record's
// outputs/status/timestamps are filled here, from what was actually written.
//
// Speed (2026-11-08): the same protocol with fewer passes over the bytes — the
// svg/jpg/eps files commit side by side (they are independent; export.json
// still goes LAST), the saved file is compared byte-for-byte with what was
// meant to be written instead of being verified a second time (equal bytes
// verify the same), and each output record hashes the bytes just proven saved
// instead of reading the file again.

import { ensureDirPath, type DirHandleLike } from "../lib/fs";
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
  const enabled = outputFormats(input.record.settings.effective);
  const dir = await ensureDirPath(input.root, input.exportDir);
  const outputs: CommitExportOutput["outputs"] = { svg: null, jpg: null, eps: null };
  // The new files are written and verified FIRST; only then may anything go
  // (RULE 23: the sweep can never cost the user their only copy).
  const written = new Map<string, Uint8Array>();
  await commitFilesTogether(plannedFiles(input, enabled), dir, written);
  for (const ext of ["svg", "jpg", "eps"] as const) {
    if (written.has(`${input.stem}.${ext}`)) outputs[ext] = `${input.stem}.${ext}`;
  }
  const named = previousNames(input);
  const removed = await sweepSuperseded(dir, input.stem, named);
  const replaced = removed.map((n) => `${input.exportDir}/${n}`);
  return { outputs, record: await writeRecord(input, dir, { outputs, replaced, written }), replaced };
}

interface PlannedFile { name: string; bytes: Uint8Array; verify: (back: Uint8Array) => boolean }

/** The enabled outputs this run rebuilt, with the check each must pass when read back. */
function plannedFiles(input: CommitExportInput, enabled: ReturnType<typeof outputFormats>): PlannedFile[] {
  const files: PlannedFile[] = [];
  if (enabled.svg && input.svgOut !== null) files.push({ name: `${input.stem}.svg`, bytes: encode(input.svgOut), verify: (back) => svgParses(decode(back)) });
  if (enabled.jpg && input.jpeg !== null) files.push({ name: `${input.stem}.jpg`, bytes: input.jpeg, verify: (back) => jpegVerifies(back, input) });
  if (enabled.eps && input.epsText !== null) files.push({ name: `${input.stem}.eps`, bytes: encode(input.epsText), verify: (back) => epsVerifies(back, input) });
  return files;
}

/**
 * Commits the files side by side. Every one runs to its end (a verify failure in
 * one never leaves another half-written), then the first failure is thrown, so
 * the outcome is the sequential one: a throw means export.json is not written.
 */
async function commitFilesTogether(files: PlannedFile[], dir: DirHandleLike, written: Map<string, Uint8Array>): Promise<void> {
  const settled = await Promise.allSettled(files.map(async (f) => {
    await commitFile(dir, f.name, f.bytes, f.verify);
    written.set(f.name, f.bytes);
  }));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

/** The file names the previous record claims, rebased onto this export folder. */
function previousNames(input: CommitExportInput): Set<string> {
  const prefix = `${input.exportDir}/`;
  const outs = [input.record.outputs.svg, input.record.outputs.jpg, input.record.outputs.eps];
  return new Set(outs.flatMap((o) => (o === null || !o.path.startsWith(prefix) ? [] : [o.path.slice(prefix.length)])));
}

/** What the file commits proved: the names, the superseded files removed, and the bytes saved under each name. */
interface CommitDone {
  outputs: CommitExportOutput["outputs"];
  replaced: readonly string[];
  written: ReadonlyMap<string, Uint8Array>;
}

/** Fills outputs/status/timestamps from what was written, then writes export.json. */
async function writeRecord(input: CommitExportInput, dir: DirHandleLike, done: CommitDone): Promise<ExportRecord> {
  const { outputs, replaced, written } = done;
  const kept = pruneRemoved(input.record.outputs, replaced, outputs);
  input.record.outputs = await committedOutputs(input, { written: outputs, kept, bytes: written });
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

/** Disabled/failed outputs leave earlier bytes on disk, but never enter the new package. */
async function committedOutputs(
  input: CommitExportInput,
  from: { written: CommitExportOutput["outputs"]; kept: ExportRecord["outputs"]; bytes: ReadonlyMap<string, Uint8Array> },
): Promise<ExportRecord["outputs"]> {
  const enabled = outputFormats(input.record.settings.effective);
  enabled.eps = enabled.eps && !input.partial;
  const outputs = { ...from.kept };
  for (const ext of ["svg", "jpg", "eps"] as const) {
    const name = from.written[ext];
    outputs[ext] = !enabled[ext] ? null : name === null ? from.kept[ext] : await outputRecord(input, name, from.bytes.get(name) as Uint8Array);
  }
  return outputs;
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
  const tmpIsContent = sameBytes(back, content);
  const saved = await overwriteAndReadBack(dir, name, content);
  // Equal bytes verify alike: the saved file is compared with the content, and
  // only re-verified when the tmp read-back was not already that exact content.
  if (saved === null || !sameBytes(saved, content) || (!tmpIsContent && !verify(saved))) {
    await dir.removeEntry?.(name);
    throw new Error(`saved-file verify failed for ${name}`);
  }
  try {
    await dir.removeEntry?.(tmp);
  } catch {
    // a leftover tmp is harmless — the next commit overwrites it
  }
}

/** Overwrites `name` and reads it back through the SAME handle (no second lookup); null when it cannot be read. */
async function overwriteAndReadBack(dir: DirHandleLike, name: string, content: Uint8Array): Promise<Uint8Array | null> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([content as BlobPart]));
  await w.close();
  try {
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

/** The record of a file just committed: its bytes were proven saved, so they are hashed as held. */
async function outputRecord(input: CommitExportInput, name: string, bytes: Uint8Array) {
  return {
    path: `${input.exportDir}/${name}`,
    bytes: bytes.length,
    hash: `sha256:${await sha256Hex(bytes)}`,
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

/** Byte equality: 32-bit words when both views are aligned (about 10x a per-byte callback), bytes otherwise. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const words = a.length >> 2;
    const wa = new Uint32Array(a.buffer, a.byteOffset, words);
    const wb = new Uint32Array(b.buffer, b.byteOffset, words);
    for (; i < words; i++) if (wa[i] !== wb[i]) return false;
    i <<= 2;
  }
  for (; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// metaembed.ts — validates edited metadata and re-embeds XMP/IPTC/RDF in-place
// into exported carriers inside `export/` + updates `export.json` atomically.

import { probePath, readBytesAt, readTextAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { ExportedFileRef, ExportedItem } from "../lib/stockupload/types";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../lib/upload/embed";
import { embedXmpMetadataInEps, verifyEpsMetadata } from "../lib/upload/epsmetadata";
import { metadataBlock, parseExportRecord, serializeExportRecord, type ExportRecord } from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import { embedXmpMetadata, readXmpMetadata } from "../lib/upload/jpeg";
import {
  cleanMetadata, dedupeTags, metadataFingerprint, validateMetadata,
  type IconMetadata, type MetadataValidation,
} from "../lib/upload/meta";
import { sameMetadata } from "../lib/upload/rights";

export type SaveMetadataResult =
  | { ok: true; metadata: IconMetadata; validation: MetadataValidation; item: ExportedItem }
  | { ok: false; validation: MetadataValidation; reason: string };

const utf8Encode = (s: string): Uint8Array => new TextEncoder().encode(s);
const utf8Decode = (b: Uint8Array): string => new TextDecoder().decode(b);

async function atomicWriteFile(
  dir: DirHandleLike,
  name: string,
  bytes: Uint8Array,
  verify: (back: Uint8Array) => boolean,
): Promise<void> {
  const tmp = `${name}.tmp`;
  await writeFileOverwrite(dir, tmp, new Blob([bytes as BlobPart]));
  const tmpBack = await readBytesAt(dir, tmp);
  if (tmpBack === null || !verify(tmpBack)) throw new Error(`tmp verify failed for ${name}`);
  await writeFileOverwrite(dir, name, new Blob([bytes as BlobPart]));
  const saved = await readBytesAt(dir, name);
  if (saved === null || !verify(saved)) throw new Error(`saved verify failed for ${name}`);
  try { await dir.removeEntry?.(tmp); } catch { /* tmp cleanup best effort */ }
}

async function reembedJpeg(
  root: DirHandleLike,
  dir: DirHandleLike,
  ref: ExportedFileRef,
  meta: IconMetadata,
): Promise<{ bytes: number; hash: string }> {
  const raw = await readBytesAt(root, ref.relPath);
  if (raw === null) throw new Error(`missing ${ref.relPath}`);
  const embedded = embedXmpMetadata(raw, meta);
  await atomicWriteFile(dir, ref.fileName, embedded, (back) => sameMetadata(readXmpMetadata(back), meta));
  return { bytes: embedded.byteLength, hash: `sha256:${await sha256Hex(embedded)}` };
}

async function reembedSvg(
  root: DirHandleLike,
  dir: DirHandleLike,
  ref: ExportedFileRef,
  meta: IconMetadata,
): Promise<{ bytes: number; hash: string }> {
  const raw = await readTextAt(root, ref.relPath);
  if (raw === null) throw new Error(`missing ${ref.relPath}`);
  const embedded = utf8Encode(embedMetadataInSvg(raw, meta));
  await atomicWriteFile(dir, ref.fileName, embedded, (back) => sameMetadata(readEmbeddedMetadata(utf8Decode(back)), meta));
  return { bytes: embedded.byteLength, hash: `sha256:${await sha256Hex(embedded)}` };
}

async function reembedEps(
  root: DirHandleLike,
  dir: DirHandleLike,
  ref: ExportedFileRef,
  meta: IconMetadata,
): Promise<{ bytes: number; hash: string }> {
  const raw = await readTextAt(root, ref.relPath);
  if (raw === null) throw new Error(`missing ${ref.relPath}`);
  const embedded = utf8Encode(embedXmpMetadataInEps(raw, meta));
  await atomicWriteFile(dir, ref.fileName, embedded, (back) => verifyEpsMetadata(utf8Decode(back), meta));
  return { bytes: embedded.byteLength, hash: `sha256:${await sha256Hex(embedded)}` };
}

function preservedOrigin(prev: ExportRecord["metadata"]) {
  if (prev !== null) {
    return { prompt: prev.prompt, provider: prev.provider, model: prev.model, requestId: prev.requestId, usage: prev.usage };
  }
  return { prompt: "", provider: "local", model: "manual", requestId: null, usage: { input: null, output: null, total: null } };
}

function updateRecordMetadata(
  rec: ExportRecord,
  meta: IconMetadata,
  validation: MetadataValidation,
  now: string,
): void {
  rec.metadata = metadataBlock(meta, {
    ...preservedOrigin(rec.metadata),
    fingerprint: metadataFingerprint(meta),
    validation,
  });
  rec.timestamps.committedAt = now;
}

async function reembedCarriers(
  ctx: { root: DirHandleLike; dir: DirHandleLike; item: ExportedItem; rec: ExportRecord },
  cleaned: IconMetadata,
): Promise<ExportedItem["files"]> {
  const nextFiles = { ...ctx.item.files };
  if (ctx.item.files.raster !== null && ctx.item.files.raster.ext === "jpg") {
    const info = await reembedJpeg(ctx.root, ctx.dir, ctx.item.files.raster, cleaned);
    if (ctx.rec.outputs.jpg) ctx.rec.outputs.jpg = { ...ctx.rec.outputs.jpg, ...info };
    nextFiles.raster = { ...ctx.item.files.raster, ...info };
  }
  if (ctx.item.files.svg) {
    const info = await reembedSvg(ctx.root, ctx.dir, ctx.item.files.svg, cleaned);
    if (ctx.rec.outputs.svg) ctx.rec.outputs.svg = { ...ctx.rec.outputs.svg, ...info };
    nextFiles.svg = { ...ctx.item.files.svg, ...info };
  }
  if (ctx.item.files.eps) {
    const info = await reembedEps(ctx.root, ctx.dir, ctx.item.files.eps, cleaned);
    if (ctx.rec.outputs.eps) ctx.rec.outputs.eps = { ...ctx.rec.outputs.eps, ...info };
    nextFiles.eps = { ...ctx.item.files.eps, ...info };
  }
  return nextFiles;
}

export async function saveExportedMetadata(
  root: DirHandleLike,
  item: ExportedItem,
  draft: IconMetadata,
  now = new Date().toISOString(),
): Promise<SaveMetadataResult> {
  const cleaned = cleanMetadata({ ...draft, tags: dedupeTags(draft.tags) });
  const validation = validateMetadata(cleaned);
  if (!validation.ok) return { ok: false, validation, reason: validation.errors.join("; ") };

  const jsonText = await readTextAt(root, item.recordPath);
  const dir = item.exportDir === "" ? root : await probePath(root, item.exportDir);
  if (jsonText === null || dir === null) {
    return { ok: false, validation, reason: `${item.recordPath} could not be read` };
  }
  const rec = parseExportRecord(JSON.parse(jsonText));
  if (rec === null) return { ok: false, validation, reason: `${item.recordPath} is invalid` };

  try {
    const nextFiles = await reembedCarriers({ root, dir, item, rec }, cleaned);
    updateRecordMetadata(rec, cleaned, validation, now);
    const jsonBytes = utf8Encode(serializeExportRecord(rec));
    await atomicWriteFile(dir, "export.json", jsonBytes, (back) => parseExportRecord(JSON.parse(utf8Decode(back))) !== null);
    return { ok: true, metadata: cleaned, validation, item: { ...item, files: nextFiles, record: rec } };
  } catch (err) {
    return { ok: false, validation, reason: (err as Error)?.message ?? "failed to update exported files" };
  }
}

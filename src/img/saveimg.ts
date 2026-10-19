// saveimg.ts — validate, name and store ONE generated AI-source image
// version (2026-10-16). Mirrors svg/saveversion.ts for raster blobs. The
// write order matches RULE 23: validate first (nothing invalid is written),
// pick next version, write the Blob into the versions subfolder (never
// overwrites), then hand back the updated pair record — which keeps its
// identity, SVG history and approval. Persisting that record is the caller's
// step.

import { AI_VERSIONS_DIR, extForFormat, imgFileName, imgRelPath, nextImgVersion } from "../lib/imgfile";
import type { AiVersion, BatchRef, CostInfo, ImageTokenUsage } from "../lib/imgmodel";
import { NO_COST } from "../lib/imgmodel";
import { ensureDirPath, writeFileNew, type DirHandleLike } from "../lib/fs";
import { type PairMeta } from "../lib/pairmeta";
import { withAiVersion } from "../lib/aimeta";
import { type ImageFormat } from "../lib/svgconnections";
import { listImgFiles, metaForSource } from "../img/imgfiles";
import type { SvgSource } from "../svg/sources";

export interface SaveImgArgs {
  root: DirHandleLike;
  source: SvgSource;
  blob: Blob;
  format: ImageFormat;
  prompt: string;
  provider: string;
  model: string;
  requestedAt: string;
  fromVersion: number;
  batch: BatchRef | null;
  requestId: string | null;
  meta: PairMeta | null;
}

export type SaveImgOut =
  | { ok: true; version: number; imagePath: string; width: number; height: number; bytes: number; meta: PairMeta }
  | { ok: false; error: string };

/** Validate, write, return the pair's record with the new version appended. */
export async function saveAiVersion(args: SaveImgArgs): Promise<SaveImgOut> {
  const v = await decode(args.blob);
  if (!v.ok) return { ok: false, error: v.error };
  const existing = await listImgFiles(args.root, args.source);
  const meta = args.meta ?? metaForSource(args.source, null);
  const version = nextImgVersion(args.source.stem, existing, meta.aiVersions);
  const ext = extForFormat(args.format);
  const name = imgFileName(args.source.stem, version, ext);
  const dir = await ensureVersionsDir(args.root, args.source.dirPath, version);
  if (!dir.ok) return { ok: false, error: dir.error };
  try {
    await writeFileNew(dir.dir, name, args.blob);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "could not write the image file" };
  }
  const imagePath = imgRelPath(args.source.dirPath, args.source.name, version, ext);
  const saved = { version, imagePath, width: v.width, height: v.height, bytes: args.blob.size };
  return { ok: true, ...saved, meta: withAiVersion(meta, toRecord(args, saved)) };
}

async function ensureVersionsDir(root: DirHandleLike, dirPath: string, version: number) {
  try {
    const parent = dirPath === "" ? root : await ensureDirPath(root, dirPath);
    if (version <= 1) return { ok: true as const, dir: parent };
    const sub = await ensureDirPath(parent, AI_VERSIONS_DIR);
    return { ok: true as const, dir: sub };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "source folder is gone" } as const;
  }
}

async function decode(blob: Blob): Promise<{ ok: true; width: number; height: number } | { ok: false; error: string }> {
  if (blob.size === 0) return { ok: false, error: "empty image returned" };
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    if (width <= 0 || height <= 0) return { ok: false, error: "image decoded with zero dimensions" };
    return { ok: true, width, height };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `image not decodable: ${e.message}` : "image not decodable" };
  }
}

function toRecord(args: SaveImgArgs, saved: { version: number; imagePath: string; width: number; height: number; bytes: number }): AiVersion {
  const usage: ImageTokenUsage = { input: null, output: null, total: null };
  const cost: CostInfo = { ...NO_COST };
  return {
    version: saved.version,
    imagePath: saved.imagePath,
    status: "generated",
    review: "pending",
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestedAt: args.requestedAt,
    completedAt: new Date().toISOString(),
    usage, cost,
    validation: { ok: true, errors: [], warnings: [], width: saved.width, height: saved.height, bytes: saved.bytes },
    batch: args.batch,
    error: null,
    requestId: args.requestId,
    fromVersion: args.fromVersion,
  };
}

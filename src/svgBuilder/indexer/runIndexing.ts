// runIndexing.ts — "Icons indexing": every approved icon whose index is missing
// or stale gets an image vector (in-memory 224 px render of its approved SVG →
// CLIP) and, when it has metadata, a text vector (title. description. tags →
// MiniLM); the record is written beside the SVG. Up-to-date icons are skipped,
// an unchanged SVG reuses its image vector, one failing icon never stops the
// run (RULE 5), and the run can be cancelled between icons.
import type { DirHandleLike } from "../../lib/fs";
import {
  IMAGE_MODEL, RENDER_BACKGROUND, RENDER_SIZE, TEXT_MODEL, iconText, indexStateOf, needsImageVector, textFingerprintOf,
  type IconIndexRecord,
} from "../../lib/iconIndex/record";
import type { BuilderIconAsset } from "../../lib/svgBuilder/types";
import { writeIconIndex } from "./indexstore";
import type { Embedder, IndexRuntime, ModelProgress, RenderedIcon } from "./runtime";

export interface IndexProgress { phase: "models" | "icons"; done: number; total: number; failed: number; model: ModelProgress | null }

export interface IndexJob {
  root: DirHandleLike;
  assets: readonly BuilderIconAsset[];
  index: ReadonlyMap<string, IconIndexRecord>;
  readSvg: (id: string) => Promise<string | null>;
  signal: AbortSignal;
  onProgress: (p: IndexProgress) => void;
}

export interface IndexOutcome { index: Map<string, IconIndexRecord>; indexed: number; skipped: number; failed: number; cancelled: boolean }

export async function runIndexing(job: IndexJob, runtime: IndexRuntime): Promise<IndexOutcome> {
  const todo = job.assets.filter((a) => indexStateOf(a, job.index.get(a.id)) !== "ok");
  const out: IndexOutcome = { index: new Map(job.index), indexed: 0, skipped: job.assets.length - todo.length, failed: 0, cancelled: false };
  if (todo.length === 0) return out;
  if (job.signal.aborted) return { ...out, cancelled: true };
  const embedder = await runtime.createEmbedder();
  try {
    await embedder.load((model) => job.onProgress({ phase: "models", done: 0, total: todo.length, failed: 0, model }));
    for (const asset of todo) {
      if (job.signal.aborted) { out.cancelled = true; break; }
      const record = await indexOne({ job, runtime, embedder, asset }).catch(() => null);
      if (record === null) out.failed++;
      else { out.index.set(asset.id, record); out.indexed++; }
      job.onProgress({ phase: "icons", done: out.indexed + out.failed, total: todo.length, failed: out.failed, model: null });
    }
  } finally {
    embedder.dispose();
  }
  return out;
}

interface OneArgs { job: IndexJob; runtime: IndexRuntime; embedder: Embedder; asset: BuilderIconAsset }

/** The in-memory render of the approved SVG, or null when the previous image vector is still valid. */
async function pixelsFor({ job, runtime, asset }: OneArgs): Promise<RenderedIcon | null> {
  if (!needsImageVector(asset, job.index.get(asset.id))) return null;
  const svg = await job.readSvg(asset.id);
  if (svg === null || svg === "") throw new Error("approved SVG unreadable");
  return runtime.render(svg);
}

async function indexOne(args: OneArgs): Promise<IconIndexRecord> {
  const { job, embedder, asset } = args;
  const prev = job.index.get(asset.id);
  const pixels = await pixelsFor(args);
  const text = iconText(asset);
  const vectors = await embedder.embed({ id: asset.id, pixels, text: text === "" ? null : text });
  const image = vectors.image ?? prev?.vectors.image;
  if (image === undefined) throw new Error("no image vector");
  const record: IconIndexRecord = {
    v: 1, id: asset.id, svgPath: asset.svgPath, svgFingerprint: asset.fingerprint, version: asset.version,
    textFingerprint: textFingerprintOf(text), models: { image: IMAGE_MODEL, text: TEXT_MODEL },
    render: { size: RENDER_SIZE, background: RENDER_BACKGROUND }, vectors: { image, text: text === "" ? null : vectors.text },
    createdAt: new Date().toISOString(),
  };
  await writeIconIndex(job.root, record);
  return record;
}

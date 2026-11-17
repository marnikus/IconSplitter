// similarity.ts — the one balanced similarity (user decisions 2026-11-08):
// final = (1 − w) × image-vector match + w × text-vector match, each a cosine of
// normalised vectors clamped to 0–1; w is the user's "mean alike" share
// (default 0.5). When either side has no text vector (no metadata), the image
// match alone is the score. All local maths.
import type { IconIndexRecord, IconVectors } from "./record";

/** The reference group's centroids (the locked / picked icons). */
export interface SimilarityReference { image: Float32Array | null; text: Float32Array | null; count: number }

export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Normalised mean of normalised vectors; null for none. */
export function centroid(vectors: readonly Float32Array[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i] ?? 0;
  const norm = Math.hypot(...out);
  return norm === 0 ? null : out.map((x) => x / norm);
}

export function referenceOf(ids: readonly string[], index: ReadonlyMap<string, IconIndexRecord>): SimilarityReference {
  const records = ids.map((id) => index.get(id)).filter((r): r is IconIndexRecord => r !== undefined);
  const texts = records.map((r) => r.vectors.text).filter((t): t is Float32Array => t !== null);
  return { image: centroid(records.map((r) => r.vectors.image)), text: centroid(texts), count: records.length };
}

/** 0–1, or null when there is no indexed reference or the icon has no vectors. `textWeight` 0 = look alike only, 1 = mean alike only. */
export function similarityOf(ref: SimilarityReference, vectors: IconVectors | undefined, textWeight = 0.5): number | null {
  if (ref.image === null || vectors === undefined) return null;
  const image = clamp01(dot(ref.image, vectors.image));
  if (ref.text === null || vectors.text === null) return image;
  const w = clamp01(textWeight);
  return (1 - w) * image + w * clamp01(dot(ref.text, vectors.text));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// imgextract.ts — parse an /v1/images/generations JSON response into Blobs
// (2026-10-16). Owns the ordering contract (data[i] -> position i — RULE 8
// honest mapping), b64_json decoding, url fetching with per-position failure
// isolation, and mime mapping from the requested output format.
// Pure (with injected fetch) — testable without a network.

import { isRecord } from "./isrecord";
import type { ImageFormat } from "./svgconnections";

export type ImagePart = { b64: string } | { url: string };

export interface Extracted {
  /** Blobs in the same order as `data[]`; failed positions are omitted. */
  blobs: Blob[];
  /** One error per failed position — position is 0-based in data[]. */
  errors: { position: number; message: string }[];
}

const MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Decode every data[] entry; isolate per-position failures (RULE 5). */
export async function extractImages(
  raw: unknown, format: ImageFormat, fetchFn: typeof fetch,
): Promise<Extracted> {
  const data = Array.isArray((raw as { data?: unknown })?.data)
    ? ((raw as { data: unknown[] }).data)
    : null;
  if (data === null) {
    return { blobs: [], errors: [{ position: -1, message: "response had no data[] array" }] };
  }
  const mime = MIME[format] ?? "image/png";
  const blobs: Blob[] = [];
  const errors: { position: number; message: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    try {
      const blob = await decodeOne(data[i], mime, fetchFn);
      blobs.push(blob);
    } catch (e) {
      errors.push({ position: i, message: e instanceof Error ? e.message : "image decode failed" });
    }
  }
  return { blobs, errors };
}

async function decodeOne(entry: unknown, mime: string, fetchFn: typeof fetch): Promise<Blob> {
  if (!isRecord(entry)) throw new Error("data entry was not an object");
  if (typeof entry.b64_json === "string" && entry.b64_json !== "") {
    return b64ToBlob(entry.b64_json, mime);
  }
  if (typeof entry.url === "string" && entry.url !== "") {
    return await fetchToBlob(entry.url, fetchFn, mime);
  }
  throw new Error("data entry had neither b64_json nor url");
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fetchToBlob(url: string, fetchFn: typeof fetch, mime: string): Promise<Blob> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`image URL returned HTTP ${res.status}`);
  const blob = await res.blob();
  return blob.size > 0 ? blob : new Blob([], { type: mime });
}

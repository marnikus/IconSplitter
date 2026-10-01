// preflight.ts — deterministic local contact-sheet preparation before consent.
// No Requesty call or temporary disk write occurs in this module.

import { createContactSheet, blobDataUrl, sha256Hex } from "../lib/svgcomposite";
import { resolveFile } from "../selection/handles";
import { compareSvgPaths, orderedManifest } from "./prompt";
import { buildRequestPayload } from "./requesty";
import type { SvgPreferences } from "./prefs";
import type { SvgSourceRow, SvgManifestItem } from "./types";

export interface PreparedBatch {
  batchId: string;
  manifest: SvgManifestItem[];
  rows: SvgSourceRow[];
  composite: Blob;
  compositeUrl: string;
  compositeDataUrl: string;
  compositeHash: string;
  payloadBytes: number;
  requestedSize: number;
  reduced: boolean;
}

interface PreflightResult {
  batches: PreparedBatch[];
  requestedImagesPerRequest: number;
  actualBatchCount: number;
  autoReduced: boolean;
}

interface FitBatchInput {
  root: Parameters<typeof resolveFile>[0];
  rows: SvgSourceRow[];
  start: number;
  requested: number;
  prefs: SvgPreferences;
}

export async function prepareBatches(
  root: Parameters<typeof resolveFile>[0], rows: SvgSourceRow[], prefs: SvgPreferences,
): Promise<PreflightResult> {
  const ordered = [...rows].sort((a, b) => compareSvgPaths(a.relativePath, b.relativePath));
  const batches: PreparedBatch[] = [];
  let cursor = 0;
  try {
    while (cursor < ordered.length) {
      const requestedSize = Math.min(prefs.imagesPerRequest, ordered.length - cursor);
      const batch = await fitBatch({ root, rows: ordered, start: cursor, requested: requestedSize, prefs });
      batches.push(batch);
      cursor += batch.rows.length;
    }
  } catch (error) {
    releaseBatches(batches);
    throw error;
  }
  return summarizeBatches(batches, prefs.imagesPerRequest);
}

function releaseBatches(batches: PreparedBatch[]): void {
  batches.forEach((batch) => URL.revokeObjectURL(batch.compositeUrl));
}

function summarizeBatches(batches: PreparedBatch[], requestedImagesPerRequest: number): PreflightResult {
  return { batches, requestedImagesPerRequest, actualBatchCount: batches.length,
    autoReduced: batches.some((batch) => batch.reduced) };
}

async function fitBatch(input: FitBatchInput): Promise<PreparedBatch> {
  const { root, rows, start, requested, prefs } = input;
  let size = requested;
  let batch = await compose(root, rows.slice(start, start + size), size, prefs);
  while (batch.payloadBytes > prefs.maxPayloadBytes && prefs.autoReducePayload && size > 1) {
    URL.revokeObjectURL(batch.compositeUrl);
    size = Math.max(1, Math.floor(size / 2));
    batch = await compose(root, rows.slice(start, start + size), size, prefs);
  }
  if (batch.payloadBytes > prefs.maxPayloadBytes) {
    URL.revokeObjectURL(batch.compositeUrl);
    throw new Error(`Contact sheet exceeds the ${formatMiB(prefs.maxPayloadBytes)} MB local payload cap; reduce cell size or raise the cap.`);
  }
  return { ...batch, reduced: size < requested };
}

async function compose(
  root: Parameters<typeof resolveFile>[0], rows: SvgSourceRow[], requestedSize: number, prefs: SvgPreferences,
): Promise<PreparedBatch> {
  const files = await readStableFiles(root, rows);
  const manifest = orderedManifest(rows.map((row) => ({
    relativePath: row.relativePath, filename: row.filename, fingerprint: row.sourceFingerprint,
  })));
  const composite = await createContactSheet(files, prefs.cellSize, prefs.paddingPx);
  const compositeDataUrl = await blobDataUrl(composite);
  const payload = buildRequestPayload({ config: requestConfig(prefs), key: "", manifest, prompt: prefs.prompt, compositeDataUrl });
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  return {
    batchId: newBatchId(), manifest, rows, composite, compositeDataUrl, payloadBytes,
    compositeUrl: URL.createObjectURL(composite), compositeHash: await sha256Hex(composite),
    requestedSize, reduced: false,
  };
}

function requestConfig(prefs: SvgPreferences) {
  return { baseUrl: prefs.baseUrl, model: prefs.model, timeoutMs: prefs.timeoutMs,
    rateLimitRetries: prefs.rateLimitRetries, maxOutputTokens: prefs.maxOutputTokens };
}

async function readStableFiles(root: Parameters<typeof resolveFile>[0], rows: SvgSourceRow[]): Promise<File[]> {
  const files: File[] = [];
  for (const row of rows) {
    const handle = await resolveFile(root, row.relativePath);
    if (!handle) throw new Error(`${row.filename} is no longer available; rescan before generating.`);
    const file = await handle.getFile();
    if (await sha256Hex(file) !== row.sourceFingerprint) throw new Error(`${row.filename} changed after scan; rescan before generating.`);
    files.push(file);
  }
  return files;
}

function newBatchId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatMiB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

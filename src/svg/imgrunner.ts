// imgrunner.ts — the Images API batch of AI source regeneration (2026-10-16;
// image EDIT since 2026-10-19). Owns: one injected-fetch attempt (Bearer key,
// stall-window timeout, honest HTTP/shape errors) and the bounded worker pool
// that keeps memory and the router happy. Every request carries the prompt AND
// the source's current main image as the reference (POST /images/edits,
// multipart); a reference that cannot be read fails THAT item honestly — it is
// never silently sent as text-only. No retry here: an uncertain outcome must
// never be silently resent (the same policy the SVG runner holds).

import type { Connection } from "../lib/svgconnections";
import { buildEditForm, imageEditUrl } from "../lib/svgimgedit";
import { b64ToBlob, parseImageResponse, readImageUsage } from "../lib/svgimgreg";
import { readRequestId, type Usage } from "../lib/svgrequest";

export interface ImageRegenItem {
  id: string;
  /** The name the reference travels under (the main AI file's own name). */
  fileName: string;
  /** Reads the reference lazily (a 1000-pair batch never holds every image); null = unreadable. */
  reference: () => Promise<Blob | null>;
}

export interface ImageRegenResult {
  id: string;
  status: "done" | "failed";
  blob?: Blob;
  error?: string;
  /** What the provider reported for this request (2026-10-19); absent when no response was read. */
  usage?: Usage;
  requestId?: string | null;
}

/** One answered request: the image plus what it spent. */
type Answer = Required<Pick<ImageRegenResult, "blob" | "usage" | "requestId">>;

export interface ImageRegenArgs {
  conn: Connection;
  key: string;
  prompt: string;
  items: readonly ImageRegenItem[];
  concurrency: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  shouldStop?: () => boolean;
}

/** The honest per-item failure for a reference that could not be read. */
const NO_REFERENCE = "the current AI image could not be read, so nothing was sent";

/** One Images API edit request: the prompt + this item's reference, one image per source. */
async function attempt(args: ImageRegenArgs, item: ImageRegenItem): Promise<Answer> {
  const { conn, key, prompt, timeoutMs, fetchImpl } = args;
  const blob = await item.reference();
  if (blob === null) throw new Error(NO_REFERENCE);
  const body = buildEditForm(conn, prompt, { blob, fileName: item.fileName });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // No Content-Type: the browser writes the multipart boundary itself.
    const response = await (fetchImpl ?? fetch)(imageEditUrl(conn.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`the image request failed (HTTP ${response.status})`);
    const raw: unknown = await response.json();
    return { blob: await imageOf(raw, fetchImpl), usage: readImageUsage(raw), requestId: readRequestId(response.headers) };
  } finally {
    clearTimeout(timer);
  }
}

/** The response's first image as a blob: inline base64, or its url fetched. */
async function imageOf(raw: unknown, fetchImpl?: typeof fetch): Promise<Blob> {
  const parsed = parseImageResponse(raw);
  if (parsed === null) throw new Error("the image response had no image in it");
  if ("b64" in parsed) return b64ToBlob(parsed.b64);
  const bin = await (fetchImpl ?? fetch)(parsed.url);
  if (!bin.ok) throw new Error(`the image url could not be read (HTTP ${bin.status})`);
  return await bin.blob();
}

/** Bounded pool: at most `concurrency` requests in flight, stop per item start. */
export async function runImageBatch(args: ImageRegenArgs): Promise<ImageRegenResult[]> {
  const results: ImageRegenResult[] = new Array(args.items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      if (i >= args.items.length || args.shouldStop?.()) return;
      next += 1;
      const item = args.items[i];
      try {
        results[i] = { id: item.id, status: "done", ...(await attempt(args, item)) };
      } catch (error) {
        results[i] = { id: item.id, status: "failed", error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(args.concurrency, args.items.length)) }, worker));
  return results;
}

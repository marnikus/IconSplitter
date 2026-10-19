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
import { b64ToBlob, parseImageResponse } from "../lib/svgimgreg";

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
}

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
async function attempt(args: ImageRegenArgs, item: ImageRegenItem): Promise<Blob> {
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
    const parsed = parseImageResponse(await response.json());
    if (parsed === null) throw new Error("the image response had no image in it");
    if ("b64" in parsed) return b64ToBlob(parsed.b64);
    const bin = await (fetchImpl ?? fetch)(parsed.url);
    if (!bin.ok) throw new Error(`the image url could not be read (HTTP ${bin.status})`);
    return await bin.blob();
  } finally {
    clearTimeout(timer);
  }
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
        results[i] = { id: item.id, status: "done", blob: await attempt(args, item) };
      } catch (error) {
        results[i] = { id: item.id, status: "failed", error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(args.concurrency, args.items.length)) }, worker));
  return results;
}

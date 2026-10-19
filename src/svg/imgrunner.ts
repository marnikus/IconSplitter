// imgrunner.ts — the Images API batch of AI source regeneration (2026-10-16;
// image EDIT since 2026-10-19). Owns: one injected-fetch attempt (Bearer key, a
// wait limit, honest HTTP/shape errors) and the bounded worker pool that keeps
// memory and the router happy. Every request carries the prompt AND the
// source's current main image as the reference (POST /images/edits, multipart
// — lib/svgimgedit); a reference that cannot be read fails THAT item honestly —
// it is never silently sent as text-only. No retry here: an uncertain outcome
// must never be silently resent (the same policy the SVG runner holds).
// 2026-10-19 fix (archive/2026-10-19-image-regen-fix): each outcome reaches
// `onResult` the moment it lands (RULE 5/24), and every failure says why — the
// router's own message (lib/svgrequest classifyHttp), a timeout, an
// unreachable host.

import type { Connection } from "../lib/svgconnections";
import { buildEditForm, imageEditUrl, type ReferenceImage } from "../lib/svgimgedit";
import { b64ToBlob, parseImageResponse } from "../lib/svgimgreg";
import { classifyHttp, parseJson } from "../lib/svgrequest";

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
  /** The whole wait for one image (svgimgreg.imageWaitMs): it arrives in one piece. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Read before each item starts: true = nothing new is sent (RULE 7). */
  shouldStop?: () => boolean;
  /** Called the moment an item's outcome is known; the caller records it. */
  onResult?: (result: ImageRegenResult, index: number) => Promise<void> | void;
}

/** The honest per-item failure for a reference that could not be read. */
const NO_REFERENCE = "the current AI image could not be read, so nothing was sent";

/** A failure already worded for the user — passed through unchanged. */
class NamedFailure extends Error {}

/** Bounded pool: at most `concurrency` requests in flight, stop read per item start. */
export async function runImageBatch(args: ImageRegenArgs): Promise<ImageRegenResult[]> {
  const results: ImageRegenResult[] = new Array(args.items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < args.items.length && args.shouldStop?.() !== true) {
      const i = next;
      next += 1;
      results[i] = await outcomeOf(args, args.items[i]);
      await args.onResult?.(results[i], i);
    }
  };
  const lanes = Math.max(1, Math.min(args.concurrency, args.items.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return results;
}

async function outcomeOf(args: ImageRegenArgs, item: ImageRegenItem): Promise<ImageRegenResult> {
  try {
    return { id: item.id, status: "done", blob: await attempt(args, item) };
  } catch (error) {
    return { id: item.id, status: "failed", error: messageOf(error) };
  }
}

/** One edit request under the wait limit; a raw transport error becomes a plain reason. */
async function attempt(args: ImageRegenArgs, item: ImageRegenItem): Promise<Blob> {
  // Read first, outside the wait: a reader that throws fails this item with its own reason.
  const blob = await item.reference();
  if (blob === null) throw new NamedFailure(NO_REFERENCE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    return await fetchImage(args, { blob, fileName: item.fileName }, controller.signal);
  } catch (error) {
    if (error instanceof NamedFailure) throw error;
    if (controller.signal.aborted) throw new NamedFailure(`no answer within ${Math.round(args.timeoutMs / 1000)} s — nothing was saved`);
    throw new NamedFailure(`the image request could not reach the provider (${messageOf(error)})`);
  } finally {
    clearTimeout(timer);
  }
}

/** The prompt + the reference, one image per source; b64 is decoded, a URL is downloaded. */
async function fetchImage(args: ImageRegenArgs, reference: ReferenceImage, signal: AbortSignal): Promise<Blob> {
  const { conn, key, prompt } = args;
  const send = args.fetchImpl ?? fetch;
  // No Content-Type: the browser writes the multipart boundary itself.
  const response = await send(imageEditUrl(conn.baseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: buildEditForm(conn, prompt, reference),
    signal,
  });
  const body = parseJson(await response.text());
  if (!response.ok) throw new NamedFailure(`the image request failed (HTTP ${classifyHttp(response.status, body, null).message})`);
  const parsed = parseImageResponse(body);
  if (parsed === null) throw new NamedFailure("the image response had no image in it");
  return "b64" in parsed ? b64ToBlob(parsed.b64) : download(parsed.url, send, signal);
}

/** A `url` answer: the browser must be allowed to read it (CORS) — b64 never needs that. */
async function download(url: string, send: typeof fetch, signal: AbortSignal): Promise<Blob> {
  const bin = await send(url, { signal }).catch((error: unknown) => {
    if (signal.aborted) throw error;
    throw new NamedFailure(`the image URL could not be downloaded (${messageOf(error)})`);
  });
  if (!bin.ok) throw new NamedFailure(`the image URL could not be read (HTTP ${bin.status})`);
  return await bin.blob();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

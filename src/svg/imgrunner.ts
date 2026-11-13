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
import { b64ToBlob, parseImageResponse, parseSingleCompositeResponse, readImageUsage } from "../lib/svgimgreg";
import { classifyHttp, parseJson, readRequestId, type Usage } from "../lib/svgrequest";

export interface ImageRegenItem {
  id: string;
  /** The name the reference travels under (the main AI file's own name). */
  fileName: string;
  /** Reads the reference lazily (a 1000-pair batch never holds every image); null = unreadable. */
  reference: () => Promise<Blob | null>;
  /** A composite uses its own visible grid prompt and requires one returned image. */
  prompt?: string;
  strict?: boolean;
}

export interface ImageRegenResult {
  id: string;
  status: "done" | "failed";
  blob?: Blob;
  error?: string;
  /** What the provider reported for this request (2026-10-19 spend log); only on a done result. */
  usage?: Usage;
  requestId?: string | null;
}

/** One answered request: the image plus what it spent. */
type Answer = Required<Pick<ImageRegenResult, "blob" | "usage" | "requestId">>;
type AnswerMeta = Pick<Answer, "usage" | "requestId">;

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
  /** Called immediately before a reference leaves this browser. */
  onSend?: (item: ImageRegenItem) => void;
  /** Called the moment an item's outcome is known; the caller records it. */
  onResult?: (result: ImageRegenResult, index: number) => Promise<void> | void;
}

/** The honest per-item failure for a reference that could not be read. */
const NO_REFERENCE = "the current AI image could not be read, so nothing was sent";

/** A named failure can still carry an answered request's real spend and ID. */
class NamedFailure extends Error {
  constructor(message: string, readonly usage?: Usage, readonly requestId?: string | null) {
    super(message);
  }
}

/** Bounded pool: at most `concurrency` requests in flight, stop read per item start. */
export async function runImageBatch(args: ImageRegenArgs): Promise<ImageRegenResult[]> {
  const results: ImageRegenResult[] = new Array(args.items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < args.items.length && args.shouldStop?.() !== true) {
      const i = next;
      next += 1;
      const result = await outcomeOf(args, args.items[i]);
      if (result === null) continue;
      results[i] = result;
      await args.onResult?.(result, i);
    }
  };
  const lanes = Math.max(1, Math.min(args.concurrency, args.items.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return results;
}

async function outcomeOf(args: ImageRegenArgs, item: ImageRegenItem): Promise<ImageRegenResult | null> {
  try {
    const answer = await attempt(args, item);
    return answer === null ? null : { id: item.id, status: "done", ...answer };
  } catch (error) {
    const answered = error instanceof NamedFailure ? error : null;
    return { id: item.id, status: "failed", error: messageOf(error), usage: answered?.usage, requestId: answered?.requestId };
  }
}

/** One edit request under the wait limit; a raw transport error becomes a plain reason. */
async function attempt(args: ImageRegenArgs, item: ImageRegenItem): Promise<Answer | null> {
  // Read first, outside the wait: a reader that throws fails this item with its own reason.
  const blob = await item.reference();
  if (args.shouldStop?.() === true) return null;
  if (blob === null) throw new NamedFailure(NO_REFERENCE);
  const reference: ReferenceImage = { blob, fileName: item.fileName };
  const form = buildEditForm(args.conn, item.prompt ?? args.prompt, reference);
  if (args.shouldStop?.() === true) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    args.onSend?.(item);
    return await fetchImage(args, form, item.strict === true, controller.signal);
  } catch (error) {
    throw attemptFailure(error, controller.signal.aborted, args.timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

function attemptFailure(error: unknown, aborted: boolean, timeoutMs: number): NamedFailure {
  if (error instanceof NamedFailure) return error;
  if (aborted) return new NamedFailure(`no answer within ${Math.round(timeoutMs / 1000)} s — nothing was saved`);
  return new NamedFailure(`the image request could not reach the provider (${messageOf(error)})`);
}

/** The prompt + the reference, one image per source; b64 is decoded, a URL is downloaded. */
async function fetchImage(args: ImageRegenArgs, form: FormData, strict: boolean, signal: AbortSignal): Promise<Answer> {
  const { conn, key } = args;
  const send = args.fetchImpl ?? fetch;
  // No Content-Type: the browser writes the multipart boundary itself.
  const response = await send(imageEditUrl(conn.baseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal,
  });
  const body = parseJson(await response.text());
  const meta: AnswerMeta = { usage: readImageUsage(body), requestId: readRequestId(response.headers) };
  if (!response.ok) throw new NamedFailure(`the image request failed (HTTP ${classifyHttp(response.status, body, null).message})`, meta.usage, meta.requestId);
  const parsed = imageInResponse(body, strict, meta);
  if (parsed === null) throw new NamedFailure("the image response had no image in it", meta.usage, meta.requestId);
  const blob = await responseBlob(parsed, send, signal, meta);
  return { blob, ...meta };
}

/** Multi-icon edits refuse ambiguous response arrays; single-image legacy behaviour is intact. */
function imageInResponse(body: unknown, strict: boolean, meta: AnswerMeta): { b64: string } | { url: string } | null {
  if (!strict) return parseImageResponse(body);
  try {
    return parseSingleCompositeResponse(body);
  } catch (error) {
    throw new NamedFailure(messageOf(error), meta.usage, meta.requestId);
  }
}

async function responseBlob(parsed: { b64: string } | { url: string }, send: typeof fetch, signal: AbortSignal, meta: AnswerMeta): Promise<Blob> {
  try {
    return "b64" in parsed ? b64ToBlob(parsed.b64) : await download(parsed.url, send, signal);
  } catch (error) {
    throw new NamedFailure(messageOf(error), meta.usage, meta.requestId);
  }
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

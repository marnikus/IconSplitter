// gettywebclient.ts — the loopback helper's Getty web routes (`/getty-web/upload`,
// `/finish`, `/test`, `/close`). Credentials go only into the loopback request;
// every returned reason is scrubbed before it can reach the log or the UI.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL, BRIDGE_FIX_HINT } from "./bridgeclient";
import { answerOf, parseFailure, parseSuccess, unreadableAnswer } from "./gettywebparse";
import type { FtpCredentials } from "./credvault";
import type { StockFtpPreset } from "./types";

const OUTDATED_GETTY_WEB_REASON = "Local helper on 127.0.0.1:47391 predates the Getty web upload — restart run_ftp_bridge.bat to enable it";
const NO_BROWSER_REASON = "No Google Chrome or Microsoft Edge was found on this machine — install one, or start Chrome with --remote-debugging-port=9222 and set GETTY_WEB_CDP";

export type GettyWebErrorCode = "helper-down" | "bad-request" | "auth" | "browser" | "page" | "timeout" | "cancelled" | "network";

export interface GettyWebMetadataPayload { title: string; description: string; keywords: string[] }

export interface GettyWebFileReport { name: string; status: string; fields?: Record<string, boolean> }

/** A contribution Getty itself answered with "Upload failed". */
export interface GettyWebRejection { name: string; id: string | null }

export type GettyWebResult =
  | {
    ok: true; batchId: string | null;
    /** Names whose card carries Getty's "Ready to submit" icon: the upload proof. */
    accepted: string[];
    /** Names Getty answered with "Upload failed" — never counted as uploaded. */
    failed?: GettyWebRejection[];
    /** Names Getty received but never validated: not submittable, not uploaded. */
    notReady?: string[];
    /** Every name the batch page listed, so "unproven" can be told from "absent". */
    seen?: string[];
    completed: boolean;
    /** Every card carried Getty's "Ready to submit" icon: finished even with no
     *  Complete control. A thumbnail never sets this. */
    ready?: boolean;
    completion: { clicked: boolean; label: string | null; confirmed: boolean } | null;
    metadata: GettyWebFileReport[];
    /** Set when this upload only filled the batch; the run finishes it later. */
    deferCompletion?: boolean;
  }
  | {
    ok: false; code: GettyWebErrorCode; reason: string;
    /** Names the page had already accepted / rejected / listed. Without them a
     *  timed-out batch is re-sent whole, duplicating everything Getty took. */
    accepted?: string[];
    failed?: GettyWebRejection[];
    /** Names the page listed but never marked "Ready to submit". */
    notReady?: string[];
    seen?: string[];
  };

export interface GettyWebFile { name: string; bytes: Uint8Array }

export interface GettyWebIcon {
  /** The icon's JPEG first, its matching EPS second. */
  files: GettyWebFile[];
  /** Accepted title/description/keywords typed into that icon's editor. */
  metadata?: GettyWebMetadataPayload | null;
}

export interface GettyWebUploadInput {
  bridgeUrl: string;
  preset: StockFtpPreset;
  creds: FtpCredentials;
  /** Every icon of this batch, sent in **one** request so the page gets all pairs
   *  in one attach. One icon is `[{ files: [jpg, eps?] }]`. */
  icons: GettyWebIcon[];
  batchName: string;
  submissionType: string;
  /** Click Complete after uploading. A run leaves this false: it finishes each
   *  batch itself, between batches. */
  complete?: boolean;
  /** Create a **new** batch instead of reusing the session's open one — one
   *  batch per chunk of a run above 100 icons. */
  newBatch?: boolean;
  sessionKey?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function trimSlash(url: string): string { return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL; }

function encodeBase64Utf8(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The per-icon manifest: names, sizes and metadata of every staged icon. */
function uploadManifest(input: GettyWebUploadInput): Uint8Array {
  const manifest = {
    icons: input.icons.map((icon) => ({
      metadata: icon.metadata ?? null,
      files: icon.files.map((file) => ({ name: file.name, bytes: file.bytes.byteLength })),
    })),
  };
  return new TextEncoder().encode(JSON.stringify(manifest));
}

/**
 * The loopback header: preset shape, credentials and the manifest length only.
 * The manifest itself rides in the body — 100 icons with 2 KB descriptions is a
 * ~290 KB base64 header, and Node answers 431 above 16 KB before any route runs,
 * which is how a 209-icon run failed instantly and never opened a browser.
 */
function uploadConfig(input: GettyWebUploadInput, manifestBytes: number): string {
  return encodeBase64Utf8(JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    sessionKey: input.sessionKey ?? "",
    batchName: input.batchName,
    submissionType: input.submissionType,
    complete: input.complete === true,
    newBatch: input.newBatch === true,
    manifestBytes,
  }));
}

/** The staged bytes one request carries, so a failure can say how big it was. */
function stagedBytesOf(input: GettyWebUploadInput): number {
  return input.icons.reduce((sum, icon) => sum + icon.files.reduce((bytes, file) => bytes + file.bytes.byteLength, 0), 0);
}

function megabytesOf(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A batch the helper could not take is not a helper that is missing: the size is
 * named, with the knob that changes it, so a 209-icon run is diagnosable.
 */
function uploadTransportReason(input: GettyWebUploadInput): string {
  return `the local helper dropped the request while taking ${megabytesOf(stagedBytesOf(input))} of files — `
    + `a request it cannot take answers 413 or 431, so check its window and raise GETTY_WEB_MAX_BYTES in run_ftp_bridge.bat`;
}

/** Every staged byte of every icon, then the manifest the header points at. */
function uploadBody(input: GettyWebUploadInput, manifest: Uint8Array): Blob {
  return new Blob([
    ...input.icons.flatMap((icon) => icon.files.map((file) => file.bytes as BlobPart)),
    manifest as BlobPart,
  ]);
}

/** Sends every icon of the run (JPEG + optional EPS each) to the Getty page. */
export async function uploadBridgeGettyWeb(input: GettyWebUploadInput): Promise<GettyWebResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const manifest = uploadManifest(input);
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/upload`, {
      method: "POST", signal: input.signal, body: uploadBody(input, manifest),
      headers: { "content-type": "application/octet-stream", "x-getty-web-config": uploadConfig(input, manifest.byteLength) },
    });
    const body = await answerOf(res);
    if (res.ok) return parseSuccess(body, input.icons.flatMap((icon) => icon.files.map((file) => file.name)));
    if (body === null) return unreadableAnswer(res.status);
    return parseFailure(body, input.creds, res.status);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { ok: false, code: "cancelled", reason: "upload cancelled" };
    return { ok: false, code: "helper-down", reason: uploadTransportReason(input) };
  }
}

/** Signs the helper's browser in without creating a batch or sending files. */
export async function testBridgeGettyWeb(
  bridgeUrl: string,
  preset: StockFtpPreset,
  creds: FtpCredentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: true } | { ok: false; code: GettyWebErrorCode; reason: string }> {
  const config = encodeBase64Utf8(JSON.stringify({ ...preset, username: creds.username, password: creds.password, sessionKey: "test" }));
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/getty-web/test`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: config,
    });
    const body: unknown = await res.json();
    return res.ok ? { ok: true } : parseFailure(body, creds, res.status);
  } catch {
    return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${BRIDGE_FIX_HINT}` };
  }
}

export interface GettyWebFinishInput {
  bridgeUrl: string;
  preset: StockFtpPreset;
  creds: FtpCredentials;
  sessionKey: string;
  fetchImpl?: typeof fetch;
}

async function finishFailure(res: Response, creds: FtpCredentials): Promise<GettyWebResult> {
  // A helper without the finish route predates this client: name the fix, not a 404.
  if (res.status === 404) return { ok: false, code: "bad-request", reason: OUTDATED_GETTY_WEB_REASON };
  return parseFailure(await res.json(), creds, res.status);
}

/** Submits the batch just filled; the helper refuses while one of its
 *  contributions is missing, so a half-uploaded batch is never locked. */
export async function finishBridgeGettyWeb(input: GettyWebFinishInput): Promise<GettyWebResult> {
  const config = encodeBase64Utf8(JSON.stringify({
    ...input.preset, username: input.creds.username, password: input.creds.password, sessionKey: input.sessionKey,
  }));
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/finish`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: config,
    });
    return res.ok ? parseSuccess(await res.json(), []) : await finishFailure(res, input.creds);
  } catch {
    return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${BRIDGE_FIX_HINT}` };
  }
}

/** Closes the pooled browser session once a run ends. */
export async function closeBridgeGettyWeb(
  bridgeUrl: string,
  sessionKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  try {
    await fetchImpl(`${trimSlash(bridgeUrl)}/getty-web/close`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionKey }),
    });
  } catch {
    // the helper already stopped, or the browser was closed by hand
  }
}

/** True when the running helper exposes the Getty web routes and a browser. */
export async function probeBridgeGettyWeb(
  bridgeUrl = DEFAULT_FTP_BRIDGE_URL,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: true; maxBytes?: number } | { ok: false; reason: string }> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/health`);
    if (!res.ok) return { ok: false, reason: `local helper answered HTTP ${res.status} — ${BRIDGE_FIX_HINT}` };
    const body: unknown = await res.json();
    if (!isRecord(body) || !isRecord(body.gettyWeb) || body.gettyWeb.ready !== true) {
      return { ok: false, reason: OUTDATED_GETTY_WEB_REASON };
    }
    if (body.gettyWeb.browser === "missing") return { ok: false, reason: NO_BROWSER_REASON };
    // Absent means an older helper: the app then assumes the small cap.
    const maxBytes = body.gettyWeb.maxBytes;
    return typeof maxBytes === "number" && Number.isFinite(maxBytes) && maxBytes > 0 ? { ok: true, maxBytes } : { ok: true };
  } catch {
    return { ok: false, reason: `local helper is not running — ${BRIDGE_FIX_HINT}` };
  }
}

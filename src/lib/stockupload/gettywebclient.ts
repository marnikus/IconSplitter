// gettywebclient.ts — the loopback helper's Getty web routes (`/getty-web/upload`,
// `/finish`, `/test`, `/close`). Credentials go only into the loopback request;
// every returned reason is scrubbed before it can reach the log or the UI.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL, BRIDGE_FIX_HINT } from "./bridgeclient";
import type { FtpCredentials } from "./credvault";
import { droppedUpload, legacyUploadAnswer, stagedBytes, unreadableAnswer } from "./gettywebdrop";
import { parseFailure, parseSuccess } from "./gettywebparse";
import type { StockFtpPreset } from "./types";

const OUTDATED_GETTY_WEB_REASON = "Local helper on 127.0.0.1:47391 predates the Getty web upload — restart run_ftp_bridge.bat to enable it";
const NO_BROWSER_REASON = "No Google Chrome or Microsoft Edge was found on this machine — install one, or start Chrome with --remote-debugging-port=9222 and set GETTY_WEB_CDP";

export type GettyWebErrorCode = "helper-down" | "bad-request" | "auth" | "browser" | "page" | "timeout" | "cancelled" | "network";

export interface GettyWebMetadataPayload {
  title: string;
  description: string;
  keywords: string[];
}

export interface GettyWebFileReport {
  name: string;
  status: string;
  fields?: Record<string, boolean>;
}

/** A contribution Getty itself answered with "Upload failed". */
export interface GettyWebRejection {
  name: string;
  id: string | null;
}

export type GettyWebResult =
  | {
    ok: true; batchId: string | null;
    /** Names whose card shows a thumbnail: Getty took these files. */
    accepted: string[];
    /** Names Getty answered with "Upload failed" — never counted as uploaded. */
    failed?: GettyWebRejection[];
    /** Every name the batch page listed, so "unproven" can be told from "absent". */
    seen?: string[];
    completed: boolean;
    /** Every contribution carried Getty's "Ready to submit" icon: the batch is
     *  finished even without a Complete control. A thumbnail never sets this. */
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
    seen?: string[];
  };

export interface GettyWebFile {
  name: string;
  bytes: Uint8Array;
}

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
  /**
   * Every icon the run uploads, sent in **one** request so the page gets all
   * pairs in one attach. One icon is `[{ files: [jpg, eps?] }]`.
   */
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

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL;
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The upload's config: preset shape + credentials + staged file sizes. */
function uploadConfigJson(input: GettyWebUploadInput): string {
  return JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    sessionKey: input.sessionKey ?? "",
    batchName: input.batchName,
    submissionType: input.submissionType,
    complete: input.complete === true,
    newBatch: input.newBatch === true,
    icons: input.icons.map((icon) => ({
      metadata: icon.metadata ?? null,
      files: icon.files.map((file) => ({ name: file.name, bytes: file.bytes.byteLength })),
    })),
  });
}

/**
 * `[uint32 config length][config JSON][staged bytes]`. The config carries 25
 * icons of title/description/49 keywords — ~180 KB, past Node's 16 KB header cap
 * (431 and a reset socket, which reads as "the helper is gone"). In the body it
 * has no limit worth naming, and no credential travels in a header.
 */
function uploadBody(input: GettyWebUploadInput): Blob {
  const config = new TextEncoder().encode(uploadConfigJson(input));
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, config.byteLength, false);
  const files = input.icons.flatMap((icon) => icon.files.map((file) => file.bytes as BlobPart));
  return new Blob([head, config, ...files]);
}

/** Sends every icon of one batch (JPEG + optional EPS each) to the Getty page. */
export async function uploadBridgeGettyWeb(input: GettyWebUploadInput): Promise<GettyWebResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  let res: Response;
  try {
    res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: uploadBody(input),
      signal: input.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { ok: false, code: "cancelled", reason: "upload cancelled" };
    return droppedUpload(trimSlash(input.bridgeUrl), fetchFn, stagedBytes(input));
  }
  const body: unknown = await res.text().then((text) => {
    try { return JSON.parse(text) as unknown; } catch { return null; }
  });
  if (body === null) return unreadableAnswer(res.status, stagedBytes(input));
  if (res.ok) return parseSuccess(body, input.icons.flatMap((icon) => icon.files.map((file) => file.name)));
  return legacyUploadAnswer(parseFailure(body, input.creds, res.status));
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
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: config,
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

/**
 * Submits the run's single batch after the last icon. The helper refuses while a
 * contribution of the run is missing, so a half-uploaded batch is never locked.
 */
export async function finishBridgeGettyWeb(input: GettyWebFinishInput): Promise<GettyWebResult> {
  const config = encodeBase64Utf8(JSON.stringify({
    ...input.preset, username: input.creds.username, password: input.creds.password,
    sessionKey: input.sessionKey,
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
      method: "POST",
      headers: { "content-type": "application/json" },
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
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/health`);
    if (!res.ok) return { ok: false, reason: `local helper answered HTTP ${res.status} — ${BRIDGE_FIX_HINT}` };
    const body: unknown = await res.json();
    if (!isRecord(body) || !isRecord(body.gettyWeb) || body.gettyWeb.ready !== true) {
      return { ok: false, reason: OUTDATED_GETTY_WEB_REASON };
    }
    if (body.gettyWeb.browser === "missing") return { ok: false, reason: NO_BROWSER_REASON };
    return { ok: true };
  } catch {
    return { ok: false, reason: `local helper is not running — ${BRIDGE_FIX_HINT}` };
  }
}

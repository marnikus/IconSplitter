// gettywebclient.ts — browser client for the loopback helper's Getty web routes
// (`/getty-web/upload`, `/getty-web/finish`, `/getty-web/test`, `/getty-web/close`).
// Credentials go
// only into the loopback request; every returned reason is scrubbed before it
// can reach the log or the UI.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL, BRIDGE_FIX_HINT } from "./bridgeclient";
import { redactCredentials, type FtpCredentials } from "./credvault";
import { parseGettySuccess, type GettyWebErrorCode, type GettyWebResult } from "./gettywebresult";
import type { StockFtpPreset } from "./types";

export type {
  GettyWebErrorCode, GettyWebFileReport, GettyWebOutcome, GettyWebRejection, GettyWebResult, GettyWebSuccess,
} from "./gettywebresult";

const OUTDATED_GETTY_WEB_REASON = "Local helper on 127.0.0.1:47391 predates the Getty web upload — restart run_ftp_bridge.bat to enable it";
const NO_BROWSER_REASON = "No Google Chrome or Microsoft Edge was found on this machine — install one, or start Chrome with --remote-debugging-port=9222 and set GETTY_WEB_CDP";

export interface GettyWebMetadataPayload {
  title: string;
  description: string;
  keywords: string[];
}

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
  /**
   * Click the batch's Complete/Submit control after uploading. Uploads of a run
   * must leave this false: the run calls `finishBridgeGettyWeb` once, at the end.
   */
  complete?: boolean;
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

/** The loopback header: preset shape + credentials + staged file sizes. */
function uploadConfig(input: GettyWebUploadInput): string {
  return encodeBase64Utf8(JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    sessionKey: input.sessionKey ?? "",
    batchName: input.batchName,
    submissionType: input.submissionType,
    complete: input.complete === true,
    icons: input.icons.map((icon) => ({
      metadata: icon.metadata ?? null,
      files: icon.files.map((file) => ({ name: file.name, bytes: file.bytes.byteLength })),
    })),
  }));
}

/** Every staged byte of every icon, in the order the config lists them. */
function uploadBody(input: GettyWebUploadInput): Blob {
  return new Blob(input.icons.flatMap((icon) => icon.files.map((file) => file.bytes as BlobPart)));
}

function parseFailure(raw: unknown, creds: FtpCredentials, status: number): { ok: false; code: GettyWebErrorCode; reason: string } {
  const code = isRecord(raw) && typeof raw.code === "string" ? raw.code as GettyWebErrorCode : "page";
  const reason = isRecord(raw) && typeof raw.reason === "string" && raw.reason.trim() !== ""
    ? redactCredentials(raw.reason.trim(), creds)
    : `Getty web upload failed (HTTP ${status})`;
  return { ok: false, code, reason };
}

/** Sends every icon of the run (JPEG + optional EPS each) to the Getty page. */
export async function uploadBridgeGettyWeb(input: GettyWebUploadInput): Promise<GettyWebResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-getty-web-config": uploadConfig(input) },
      body: uploadBody(input),
      signal: input.signal,
    });
    const body: unknown = await res.json();
    if (res.ok) return parseGettySuccess(body);
    return parseFailure(body, input.creds, res.status);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { ok: false, code: "cancelled", reason: "upload cancelled" };
    return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${BRIDGE_FIX_HINT}` };
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
    return res.ok ? parseGettySuccess(await res.json()) : await finishFailure(res, input.creds);
  } catch {
    return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${BRIDGE_FIX_HINT}` };
  }
}

export interface GettyWebRetryInput extends GettyWebFinishInput {
  /** The file names still not ready: only these are re-filled and re-saved. */
  names: string[];
}

/**
 * Re-checks the still-open batch: re-fills the metadata of the named files that
 * never got it, saves the grid again and re-reads every card. No new batch and no
 * new attach, so a retry cannot duplicate a contribution.
 */
export async function retryBridgeGettyWeb(input: GettyWebRetryInput): Promise<GettyWebResult> {
  const config = encodeBase64Utf8(JSON.stringify({
    ...input.preset, username: input.creds.username, password: input.creds.password,
    sessionKey: input.sessionKey, names: input.names,
  }));
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/retry`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: config,
    });
    return res.ok ? parseGettySuccess(await res.json()) : await finishFailure(res, input.creds);
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

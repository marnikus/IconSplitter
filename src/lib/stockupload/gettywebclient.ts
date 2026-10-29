// gettywebclient.ts — browser client for the loopback helper's Getty web routes
// (`/getty-web/upload`, `/getty-web/test`, `/getty-web/close`). Credentials go
// only into the loopback request; every returned reason is scrubbed before it
// can reach the log or the UI.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL, BRIDGE_FIX_HINT } from "./bridgeclient";
import { redactCredentials, type FtpCredentials } from "./credvault";
import type { StockFtpPreset } from "./types";

const OUTDATED_GETTY_WEB_REASON = "Local helper on 127.0.0.1:47391 predates the Getty web upload — restart run_ftp_bridge.bat to enable it";
const NO_BROWSER_REASON = "No Google Chrome or Microsoft Edge was found on this machine — install one, or start Chrome with --remote-debugging-port=9222 and set GETTY_WEB_CDP";

export type GettyWebErrorCode = "helper-down" | "bad-request" | "auth" | "browser" | "page" | "timeout" | "cancelled" | "network";

export type GettyWebResult =
  | { ok: true; batchId: string | null; accepted: string[] }
  | { ok: false; code: GettyWebErrorCode; reason: string };

export interface GettyWebFile {
  name: string;
  bytes: Uint8Array;
}

export interface GettyWebUploadInput {
  bridgeUrl: string;
  preset: StockFtpPreset;
  creds: FtpCredentials;
  files: GettyWebFile[];
  batchName: string;
  submissionType: string;
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
    files: input.files.map((file) => ({ name: file.name, bytes: file.bytes.byteLength })),
  }));
}

function parseFailure(raw: unknown, creds: FtpCredentials, status: number): { ok: false; code: GettyWebErrorCode; reason: string } {
  const code = isRecord(raw) && typeof raw.code === "string" ? raw.code as GettyWebErrorCode : "page";
  const reason = isRecord(raw) && typeof raw.reason === "string" && raw.reason.trim() !== ""
    ? redactCredentials(raw.reason.trim(), creds)
    : `Getty web upload failed (HTTP ${status})`;
  return { ok: false, code, reason };
}

function parseSuccess(raw: unknown, fallback: string[]): GettyWebResult {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false, code: "page", reason: "unexpected helper response" };
  return {
    ok: true,
    batchId: typeof raw.batchId === "string" ? raw.batchId : null,
    accepted: Array.isArray(raw.accepted) ? raw.accepted.filter((n): n is string => typeof n === "string") : fallback,
  };
}

/** Sends one icon (JPEG + optional EPS) through the helper to the Getty page. */
export async function uploadBridgeGettyWeb(input: GettyWebUploadInput): Promise<GettyWebResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/getty-web/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-getty-web-config": uploadConfig(input) },
      body: new Blob(input.files.map((file) => file.bytes as BlobPart)),
      signal: input.signal,
    });
    const body: unknown = await res.json();
    if (res.ok) return parseSuccess(body, input.files.map((file) => file.name));
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

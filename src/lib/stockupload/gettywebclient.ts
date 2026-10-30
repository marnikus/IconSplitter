// gettywebclient.ts — the loopback helper's Getty web routes (`/getty-web/upload`,
// `/finish`, `/test`, `/close`). Credentials go only into the loopback request;
// every returned reason is scrubbed before it can reach the log or the UI.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL, BRIDGE_FIX_HINT } from "./bridgeclient";
import { redactCredentials, type FtpCredentials } from "./credvault";
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
    newBatch: input.newBatch === true,
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

function nameList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((name): name is string => typeof name === "string") : [];
}

function parseFailure(raw: unknown, creds: FtpCredentials, status: number): { ok: false; code: GettyWebErrorCode; reason: string } {
  const code = isRecord(raw) && typeof raw.code === "string" ? raw.code as GettyWebErrorCode : "page";
  const reason = isRecord(raw) && typeof raw.reason === "string" && raw.reason.trim() !== ""
    ? redactCredentials(raw.reason.trim(), creds)
    : `Getty web upload failed (HTTP ${status})`;
  if (!isRecord(raw)) return { ok: false, code, reason };
  // A failed batch still says what it accepted: those icons are not re-sent.
  const accepted = nameList(raw.accepted);
  const failed = failedEntries(raw);
  const seen = nameList(raw.seen);
  return {
    ok: false, code, reason,
    ...(accepted.length > 0 ? { accepted } : {}),
    ...(failed.length > 0 ? { failed } : {}),
    ...(seen.length > 0 ? { seen } : {}),
  };
}

function metadataEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.metadata)) return [];
  return raw.metadata.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    status: typeof entry.status === "string" ? entry.status : "unknown",
    ...(isRecord(entry.fields) ? { fields: entry.fields as Record<string, boolean> } : {}),
  }));
}

function failedEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.failed)) return [];
  return raw.failed.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    id: typeof entry.id === "string" ? entry.id : null,
  }));
}

function completionOf(raw: Record<string, unknown>) {
  if (!isRecord(raw.completion)) return null;
  return {
    clicked: raw.completion.clicked === true,
    label: typeof raw.completion.label === "string" ? raw.completion.label : null,
    confirmed: raw.completion.confirmed === true,
  };
}

function parseSuccess(raw: unknown, fallback: string[]): GettyWebResult {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false, code: "page", reason: "unexpected helper response" };
  return {
    ok: true,
    batchId: typeof raw.batchId === "string" ? raw.batchId : null,
    accepted: Array.isArray(raw.accepted) ? raw.accepted.filter((n): n is string => typeof n === "string") : fallback,
    failed: failedEntries(raw),
    completed: raw.completed === true,
    // Absent means "not proven ready", never "ready".
    ...(raw.ready === true ? { ready: true } : {}),
    completion: completionOf(raw),
    metadata: metadataEntries(raw),
  };
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
    if (res.ok) return parseSuccess(body, input.icons.flatMap((icon) => icon.files.map((file) => file.name)));
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

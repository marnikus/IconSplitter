// bridgeclient.ts — browser HTTP client for the local loopback FTPS/SFTP helper
// (`http://127.0.0.1:47391/ftps/*`). Redacts credentials from any error message.

import { isRecord } from "../isrecord";
import { redactCredentials, type FtpCredentials } from "./credvault";
import type { StockFtpPreset } from "./types";

export const DEFAULT_FTP_BRIDGE_URL = "http://127.0.0.1:47391";
export const BRIDGE_FIX_HINT = "start run_ftp_bridge.bat (or run_inkscape_bridge.bat) on this machine";

export type FtpsErrorCode = "helper-down" | "bad-request" | "auth" | "cert" | "network" | "ftp" | "timeout";

export type BridgeProbeResult =
  | { ok: true }
  | { ok: false; reason: string };

export type BridgeTestResult =
  | { ok: true; serverCertSha256: string | null }
  | { ok: false; code: FtpsErrorCode; reason: string; serverCertSha256: string | null };

export type BridgeUploadResult =
  | { ok: true; bytes: number }
  | { ok: false; code: FtpsErrorCode; reason: string; serverCertSha256: string | null };

export interface BridgeUploadInput {
  bridgeUrl: string;
  preset: StockFtpPreset;
  creds: FtpCredentials;
  fileName: string;
  bytes: Uint8Array;
  sessionKey?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL;
}

function toFailure(raw: unknown, creds: FtpCredentials): {
  code: FtpsErrorCode;
  reason: string;
  serverCertSha256: string | null;
} {
  if (!isRecord(raw)) return { code: "ftp", reason: "unexpected helper response", serverCertSha256: null };
  const code = typeof raw.code === "string" ? (raw.code as FtpsErrorCode) : "ftp";
  const reason = redactCredentials(typeof raw.reason === "string" ? raw.reason : "FTPS error", creds);
  const cert = typeof raw.serverCertSha256 === "string" ? raw.serverCertSha256 : null;
  return { code, reason, serverCertSha256: cert };
}

export async function probeBridgeFtps(
  bridgeUrl = DEFAULT_FTP_BRIDGE_URL,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<BridgeProbeResult> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/health`);
    if (!res.ok) return { ok: false, reason: `local helper answered HTTP ${res.status} — ${BRIDGE_FIX_HINT}` };
    const body: unknown = await res.json();
    if (isRecord(body) && isRecord(body.ftps) && body.ftps.ready === true) return { ok: true };
    return { ok: false, reason: `local helper does not expose FTPS/SFTP — restart ${BRIDGE_FIX_HINT}` };
  } catch {
    return { ok: false, reason: `local FTPS/SFTP helper is not running — ${BRIDGE_FIX_HINT}` };
  }
}

export async function testBridgeFtps(
  bridgeUrl: string,
  preset: StockFtpPreset,
  creds: FtpCredentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<BridgeTestResult> {
  try {
    const payload = { ...preset, username: creds.username, password: creds.password };
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/ftps/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body: unknown = await res.json();
    if (res.ok && isRecord(body) && body.ok === true) {
      return { ok: true, serverCertSha256: typeof body.serverCertSha256 === "string" ? body.serverCertSha256 : null };
    }
    return { ok: false, ...toFailure(body, creds) };
  } catch {
    return { ok: false, code: "helper-down", reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}`, serverCertSha256: null };
  }
}

function buildUploadHeader(input: BridgeUploadInput): string {
  return encodeBase64Utf8(JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    fileName: input.fileName,
    sessionKey: input.sessionKey,
  }));
}

export async function uploadBridgeFtps(input: BridgeUploadInput): Promise<BridgeUploadResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/ftps/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-ftps-config": buildUploadHeader(input) },
      body: new Blob([input.bytes as BlobPart]),
      signal: input.signal,
    });
    const body: unknown = await res.json();
    if (res.ok && isRecord(body) && body.ok === true) {
      return { ok: true, bytes: typeof body.bytes === "number" ? body.bytes : input.bytes.byteLength };
    }
    return { ok: false, ...toFailure(body, input.creds) };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, code: "network", reason: "upload cancelled", serverCertSha256: null };
    }
    return { ok: false, code: "helper-down", reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}`, serverCertSha256: null };
  }
}

export async function closeBridgeFtpsSession(
  bridgeUrl: string,
  sessionKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  try {
    await fetchImpl(`${trimSlash(bridgeUrl)}/ftps/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionKey }),
    });
  } catch {
    // helper already stopped or session expired
  }
}

// bridgeclient.ts — browser HTTP client for the local loopback FTPS/SFTP helper
// (`http://127.0.0.1:47391/ftps/*`). Redacts credentials from any error message.

import { isRecord } from "../isrecord";
import { redactCredentials, type FtpCredentials } from "./credvault";
import type { FtpProtocol, StockFtpPreset } from "./types";

export const DEFAULT_FTP_BRIDGE_URL = "http://127.0.0.1:47391";
export const BRIDGE_FIX_HINT = "start run_ftp_bridge.bat (or run_inkscape_bridge.bat) on this machine";
const OUTDATED_SFTP_REASON = "Local helper on 127.0.0.1:47391 is an older FTPS-only instance — close that helper cmd window and run run_ftp_bridge.bat to enable SFTP (:22)";
const OUTDATED_ESP_REASON = "Local helper on 127.0.0.1:47391 predates Getty ESP support — restart run_ftp_bridge.bat to enable Getty ESP HTTPS (:443)";

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
  pairedFile?: { fileName: string; bytes: Uint8Array };
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

function toFailure(raw: unknown, creds: FtpCredentials, protocol?: FtpProtocol): {
  code: FtpsErrorCode;
  reason: string;
  serverCertSha256: string | null;
} {
  if (!isRecord(raw)) return { code: "ftp", reason: "unexpected helper response", serverCertSha256: null };
  const rawReason = typeof raw.reason === "string" ? raw.reason : "FTPS error";
  if (protocol === "sftp" && /^FTPS\b/i.test(rawReason)) {
    return { code: "helper-down", reason: OUTDATED_SFTP_REASON, serverCertSha256: null };
  }
  if (protocol === "esp-https" && /^FTPS\b/i.test(rawReason)) {
    return { code: "helper-down", reason: OUTDATED_ESP_REASON, serverCertSha256: null };
  }
  const code = typeof raw.code === "string" ? (raw.code as FtpsErrorCode) : "ftp";
  const nonEmpty = rawReason.trim() !== "" ? rawReason : `Connection failed (${code})`;
  const reason = redactCredentials(nonEmpty, creds);
  const cert = typeof raw.serverCertSha256 === "string" ? raw.serverCertSha256 : null;
  return { code, reason, serverCertSha256: cert };
}

function hasReadyFlag(body: unknown, key: string): boolean {
  return isRecord(body) && isRecord(body[key]) && body[key].ready === true;
}

function verifyProbeCapabilities(
  body: unknown,
  opts?: { requireSftp?: boolean; requireEsp?: boolean },
): BridgeProbeResult {
  if (!hasReadyFlag(body, "ftps")) {
    return { ok: false, reason: `local helper does not expose FTPS/SFTP — restart ${BRIDGE_FIX_HINT}` };
  }
  if (opts?.requireSftp && !hasReadyFlag(body, "sftp")) return { ok: false, reason: OUTDATED_SFTP_REASON };
  if (opts?.requireEsp && !hasReadyFlag(body, "esp")) return { ok: false, reason: OUTDATED_ESP_REASON };
  return { ok: true };
}

export async function probeBridgeFtps(
  bridgeUrl = DEFAULT_FTP_BRIDGE_URL,
  fetchImpl: typeof fetch = globalThis.fetch,
  opts?: { requireSftp?: boolean; requireEsp?: boolean },
): Promise<BridgeProbeResult> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/health`);
    if (!res.ok) return { ok: false, reason: `local helper answered HTTP ${res.status} — ${BRIDGE_FIX_HINT}` };
    return verifyProbeCapabilities(await res.json(), opts);
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
    const payload = {
      ...preset,
      username: creds.username,
      password: creds.password,
      ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
      ...(creds.apiSecret ? { apiSecret: creds.apiSecret } : {}),
    };
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/ftps/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body: unknown = await res.json();
    if (res.ok && isRecord(body) && body.ok === true) {
      return { ok: true, serverCertSha256: typeof body.serverCertSha256 === "string" ? body.serverCertSha256 : null };
    }
    return { ok: false, ...toFailure(body, creds, preset.protocol) };
  } catch {
    return { ok: false, code: "helper-down", reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}`, serverCertSha256: null };
  }
}

function buildUploadHeader(input: BridgeUploadInput): string {
  return encodeBase64Utf8(JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    ...(input.creds.apiKey ? { apiKey: input.creds.apiKey } : {}),
    ...(input.creds.apiSecret ? { apiSecret: input.creds.apiSecret } : {}),
    fileName: input.fileName,
    ...(input.pairedFile ? { pairedFileName: input.pairedFile.fileName, rasterBytes: input.bytes.byteLength } : {}),
    sessionKey: input.sessionKey,
  }));
}

export async function uploadBridgeFtps(input: BridgeUploadInput): Promise<BridgeUploadResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${trimSlash(input.bridgeUrl)}/ftps/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-ftps-config": buildUploadHeader(input) },
      body: new Blob([input.bytes as BlobPart, ...(input.pairedFile ? [input.pairedFile.bytes as BlobPart] : [])]),
      signal: input.signal,
    });
    const body: unknown = await res.json();
    if (res.ok && isRecord(body) && body.ok === true) {
      return { ok: true, bytes: typeof body.bytes === "number" ? body.bytes : input.bytes.byteLength };
    }
    return { ok: false, ...toFailure(body, input.creds, input.preset.protocol) };
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

function parseEspOAuthStartBody(
  ok: boolean,
  body: unknown,
  creds: FtpCredentials,
): { ok: true; state: string; authorizeUrl: string } | { ok: false; reason: string } {
  if (ok && isRecord(body) && body.ok === true && typeof body.authorizeUrl === "string") {
    return { ok: true, state: String(body.state ?? ""), authorizeUrl: body.authorizeUrl };
  }
  const raw = isRecord(body) && typeof body.reason === "string" ? body.reason : "Could not start Getty OAuth2 flow";
  return { ok: false, reason: redactCredentials(raw, creds) };
}

export async function startBridgeEspOAuth(
  bridgeUrl: string,
  preset: StockFtpPreset,
  creds: FtpCredentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: true; state: string; authorizeUrl: string } | { ok: false; reason: string }> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/esp/oauth/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey ?? "",
        apiSecret: creds.apiSecret ?? "",
        host: preset.host,
        port: preset.port,
        tlsPolicy: preset.tlsPolicy,
        pinnedCertSha256: preset.pinnedCertSha256,
      }),
    });
    return parseEspOAuthStartBody(res.ok, await res.json(), creds);
  } catch {
    return { ok: false, reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}` };
  }
}

export async function checkBridgeEspOAuthStatus(
  bridgeUrl: string,
  state: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ authorized: boolean; error: string | null }> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/esp/oauth/status?state=${encodeURIComponent(state)}`);
    const body: unknown = await res.json();
    if (!res.ok || !isRecord(body)) return { authorized: false, error: null };
    return { authorized: body.authorized === true, error: typeof body.error === "string" ? body.error : null };
  } catch {
    return { authorized: false, error: null };
  }
}

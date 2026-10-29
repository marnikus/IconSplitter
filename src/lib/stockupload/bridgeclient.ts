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

/** Sanitized failure diagnostics from the helper: which protocol stage failed + server HTTP status. */
export interface BridgeFailureDiag {
  stage: string | null;
  httpStatus: number | null;
}

export type BridgeTestResult =
  | { ok: true; serverCertSha256: string | null }
  | { ok: false; code: FtpsErrorCode; reason: string; serverCertSha256: string | null } & BridgeFailureDiag;

export type BridgeUploadResult =
  | { ok: true; bytes: number; espBatchId?: string; espContributionId?: string }
  | { ok: false; code: FtpsErrorCode; reason: string; serverCertSha256: string | null } & BridgeFailureDiag;

/** Getty ESP illustration pairing: EPS (vector slot) + JPG (raster slot) of one contribution. */
export interface EspPairNames {
  epsFileName?: string;
  rasterFileName?: string;
}

export interface BridgeUploadInput {
  bridgeUrl: string;
  preset: StockFtpPreset;
  creds: FtpCredentials;
  fileName: string;
  bytes: Uint8Array;
  sessionKey?: string;
  espPair?: EspPairNames;
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

type BridgeFailure = {
  code: FtpsErrorCode;
  reason: string;
  serverCertSha256: string | null;
} & BridgeFailureDiag;

/** Full staged failure to the browser console (codes only — reason is credential-scrubbed). */
function reportBridgeFailure(where: string, f: BridgeFailure): BridgeFailure {
  console.error(`[stock-upload] ${where} failed stage=${f.stage ?? "-"} http=${f.httpStatus ?? "-"} code=${f.code} — ${f.reason}`);
  return f;
}

function diagOf(raw: Record<string, unknown>): BridgeFailureDiag {
  return {
    stage: typeof raw.stage === "string" && raw.stage.trim() !== "" ? raw.stage : null,
    httpStatus: typeof raw.httpStatus === "number" && Number.isFinite(raw.httpStatus) ? raw.httpStatus : null,
  };
}

function toFailure(raw: unknown, creds: FtpCredentials, protocol?: FtpProtocol): BridgeFailure {
  if (!isRecord(raw)) return { code: "ftp", reason: "unexpected helper response", serverCertSha256: null, stage: null, httpStatus: null };
  const rawReason = typeof raw.reason === "string" ? raw.reason : "FTPS error";
  if (protocol === "sftp" && /^FTPS\b/i.test(rawReason)) {
    return { code: "helper-down", reason: OUTDATED_SFTP_REASON, serverCertSha256: null, stage: "helper-probe", httpStatus: null };
  }
  if (protocol === "esp-https" && /^FTPS\b/i.test(rawReason)) {
    return { code: "helper-down", reason: OUTDATED_ESP_REASON, serverCertSha256: null, stage: "helper-probe", httpStatus: null };
  }
  const code = typeof raw.code === "string" ? (raw.code as FtpsErrorCode) : "ftp";
  const nonEmpty = rawReason.trim() !== "" ? rawReason : `Connection failed (${code})`;
  const reason = redactCredentials(nonEmpty, creds);
  const cert = typeof raw.serverCertSha256 === "string" ? raw.serverCertSha256 : null;
  return { code, reason, serverCertSha256: cert, ...diagOf(raw) };
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
    if (!res.ok) {
      const reason = `local helper answered HTTP ${res.status} — ${BRIDGE_FIX_HINT}`;
      console.error(`[stock-upload] helper probe failed stage=helper-probe http=${res.status} — ${reason}`);
      return { ok: false, reason };
    }
    const verdict = verifyProbeCapabilities(await res.json(), opts);
    if (!verdict.ok) console.error(`[stock-upload] helper probe failed stage=helper-probe — ${verdict.reason}`);
    return verdict;
  } catch {
    const reason = `local FTPS/SFTP helper is not running — ${BRIDGE_FIX_HINT}`;
    console.error(`[stock-upload] helper probe failed stage=helper-probe — ${reason}`);
    return { ok: false, reason };
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
    return { ok: false, ...reportBridgeFailure("connection test", toFailure(body, creds, preset.protocol)) };
  } catch {
    return { ok: false, ...reportBridgeFailure("connection test", { code: "helper-down", reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}`, serverCertSha256: null, stage: "helper-probe", httpStatus: null }) };
  }
}

function buildUploadHeader(input: BridgeUploadInput): string {
  return encodeBase64Utf8(JSON.stringify({
    ...input.preset,
    username: input.creds.username,
    password: input.creds.password,
    ...(input.creds.apiKey ? { apiKey: input.creds.apiKey } : {}),
    ...(input.creds.apiSecret ? { apiSecret: input.creds.apiSecret } : {}),
    ...(input.espPair ? { espPair: input.espPair } : {}),
    fileName: input.fileName,
    sessionKey: input.sessionKey,
  }));
}

function uploadOkOf(body: Record<string, unknown>, fallbackBytes: number): BridgeUploadResult {
  return {
    ok: true, bytes: typeof body.bytes === "number" ? body.bytes : fallbackBytes,
    ...(typeof body.espBatchId === "string" ? { espBatchId: body.espBatchId } : {}),
    ...(typeof body.espContributionId === "string" ? { espContributionId: body.espContributionId } : {}),
  };
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
    if (res.ok && isRecord(body) && body.ok === true) return uploadOkOf(body, input.bytes.byteLength);
    return { ok: false, ...reportBridgeFailure("upload", toFailure(body, input.creds, input.preset.protocol)) };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, code: "network", reason: "upload cancelled", serverCertSha256: null, stage: "upload-cancelled", httpStatus: null };
    }
    return { ok: false, ...reportBridgeFailure("upload", { code: "helper-down", reason: `cannot reach local FTPS/SFTP helper — ${BRIDGE_FIX_HINT}`, serverCertSha256: null, stage: "helper-probe", httpStatus: null }) };
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

// gettywebdrop.ts — what a failed upload request actually means. A helper that
// answers `/health` is NOT a missing helper, whatever went wrong with the body,
// so "start run_ftp_bridge.bat" is reserved for a bridge that is really gone.

import { BRIDGE_FIX_HINT } from "./bridgeclient";
import type { GettyWebResult, GettyWebUploadInput } from "./gettywebclient";

/** A helper older than this app build answers the body-carrying upload with it. */
const LEGACY_ANSWER = "drives the Getty web upload only";

export function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/** The exact bytes this request puts on the loopback socket. */
export function stagedBytes(input: GettyWebUploadInput): number {
  return input.icons.reduce(
    (total, icon) => total + icon.files.reduce((sum, file) => sum + file.bytes.byteLength, 0), 0,
  );
}

async function answers(base: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${base}/health`);
    return res.ok === true;
  } catch {
    return false;
  }
}

/** The request never got an answer: either the helper dropped it, or it is gone. */
export async function droppedUpload(
  base: string, fetchImpl: typeof fetch, bytes: number,
): Promise<{ ok: false; code: "network" | "helper-down"; reason: string }> {
  if (await answers(base, fetchImpl)) {
    return {
      ok: false, code: "network",
      reason: `the helper dropped the upload (${megabytes(bytes)}) before it answered — retry; if it repeats, restart run_ftp_bridge.bat`,
    };
  }
  return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${BRIDGE_FIX_HINT}` };
}

/** The helper answered, but not with JSON: name the status, never the bridge. */
export function unreadableAnswer(status: number, bytes: number): GettyWebResult {
  if (status === 413) {
    return {
      ok: false, code: "bad-request",
      reason: `the helper refused this ${megabytes(bytes)} upload as too large (HTTP 413) — restart run_ftp_bridge.bat after raising BRIDGE_FTP_MAX_BYTES`,
    };
  }
  return {
    ok: false, code: "page",
    reason: `the helper answered HTTP ${status} without a JSON body — retry the upload, and restart run_ftp_bridge.bat if it repeats`,
  };
}

/** A helper this old does not read a config out of the body: it needs a restart. */
export function legacyUploadAnswer(failure: GettyWebResult): GettyWebResult {
  if (failure.ok || !failure.reason.includes(LEGACY_ANSWER)) return failure;
  return { ok: false, code: "bad-request", reason: `the local helper predates this app build — restart ${BRIDGE_FIX_HINT}` };
}

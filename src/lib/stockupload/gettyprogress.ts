// gettyprogress.ts — the live per-file counts of a running Getty web upload.
// The one upload request takes a while, so the app polls this while it is in
// flight; nothing but counts leaves the helper, never a name or page text.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL } from "./bridgeclient";

/** Live per-file counts of a running upload (no names, no page text). */
export interface GettyWebProgress {
  phase: string;
  total: number;
  uploaded: number;
  failed: number;
  listed: number;
  /** How many times the helper had to reload Getty's page to get it moving. */
  reloads: number;
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL;
}

const countOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

function readProgress(raw: Record<string, unknown>): GettyWebProgress {
  return {
    phase: typeof raw.phase === "string" ? raw.phase : "uploading",
    total: countOf(raw.total), uploaded: countOf(raw.uploaded),
    failed: countOf(raw.failed), listed: countOf(raw.listed), reloads: countOf(raw.reloads),
  };
}

/**
 * Reads the live per-file counts of a running upload. A helper without this
 * route (or none at all) answers nothing, so progress is best-effort only.
 */
export async function gettyWebProgress(
  bridgeUrl: string,
  sessionKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<GettyWebProgress | null> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/getty-web/progress?sessionKey=${encodeURIComponent(sessionKey)}`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isRecord(body) || body.ok !== true || !isRecord(body.progress)) return null;
    return readProgress(body.progress);
  } catch {
    return null;
  }
}

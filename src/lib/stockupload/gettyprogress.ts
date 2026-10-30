// gettyprogress.ts — the live per-file counts of a running Getty web upload.
// The one upload request takes a while, so the app polls this while it is in
// flight; nothing but counts leaves the helper, never a name or page text.
//
// Two counts are different facts and must never be confused:
//   `uploaded` — the card rendered its picture: the bytes arrived, nothing more;
//   `ready`    — the card carries Getty's own "Ready to submit" chip: the only
//                proof a file passed validation, and the only success truth.
// `pending` is listed but neither ready nor failed, so a reading always says what
// is still open. `verified` says whether the reading came from rendered cards at
// all — a helper that cannot read the page must not look like a finished run.

import { isRecord } from "../isrecord";
import { DEFAULT_FTP_BRIDGE_URL } from "./bridgeclient";

/** Live per-file counts of a running upload (no names, no page text). */
export interface GettyWebProgress {
  phase: string;
  total: number;
  /** Files whose card rendered a picture — arrived, never "uploaded". */
  uploaded: number;
  failed: number;
  listed: number;
  /** Cards carrying Getty's "Ready to submit" icon: the submission proof. */
  ready: number;
  /** Listed, no chip yet, not failed: Getty is still ingesting these files. */
  pending: number;
  /** The counts came from rendered contribution cards, so readiness is real. */
  verified: boolean;
  /** How many times the helper had to reload Getty's page to get it moving. */
  reloads: number;
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL;
}

const countOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

function readProgress(raw: Record<string, unknown>): GettyWebProgress {
  const listed = countOf(raw.listed);
  const ready = countOf(raw.ready);
  const failed = countOf(raw.failed);
  return {
    phase: typeof raw.phase === "string" ? raw.phase : "uploading",
    total: countOf(raw.total), uploaded: countOf(raw.uploaded),
    failed, listed, ready,
    // Every reading states what is still open: never inferred from "ready is 0".
    pending: countOf(raw.pending) || Math.max(0, listed - ready - failed),
    verified: raw.verified === true,
    reloads: countOf(raw.reloads),
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

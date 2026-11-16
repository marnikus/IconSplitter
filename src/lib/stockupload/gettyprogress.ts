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
  /** Cards carrying Getty's "Ready to submit" icon — the submission proof. */
  ready?: number;
  /** How many times the helper had to reload Getty's page to get it moving. */
  reloads: number;
  /** Which 100-icon batch of the run these counts belong to (1-based). */
  batch?: number;
  /** What the helper waits for right now (a retry timer or a deadline), when it waits. */
  wait?: GettyWait;
  /** What the helper is doing once a wait is over ("Reloading the Getty page…"). */
  activity?: string;
}

/** A wait the helper reports: why, what comes next, which attempt, the time left (2026-11-12). */
export interface GettyWait {
  kind: string;
  reason: string;
  next: string;
  remainingMs: number;
  attempt?: number;
  of?: number;
  /** A retry timer can be skipped ("Retry now"); a deadline cannot. */
  skippable: boolean;
  /** The skip button's own words when skipping gives up early ("Skip wait"), else "Retry now". */
  skipLabel?: string;
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "") || DEFAULT_FTP_BRIDGE_URL;
}

const countOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

const TEXT_MAX = 240;
const textOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value.slice(0, TEXT_MAX) : null);

/** A wait with its words and counts; anything damaged is no wait at all. */
function readWait(raw: unknown): GettyWait | null {
  if (!isRecord(raw)) return null;
  const kind = textOf(raw.kind), reason = textOf(raw.reason), next = textOf(raw.next);
  if (kind === null || reason === null || next === null) return null;
  const attempt = countOf(raw.attempt), of = countOf(raw.of);
  const skipLabel = textOf(raw.skipLabel);
  return {
    kind, reason, next, remainingMs: countOf(raw.remainingMs), ...(attempt > 0 && of > 0 ? { attempt, of } : {}),
    skippable: raw.skippable === true, ...(skipLabel !== null ? { skipLabel: skipLabel.slice(0, 40) } : {}),
  };
}

function readProgress(raw: Record<string, unknown>): GettyWebProgress {
  const wait = readWait(raw.wait);
  const activity = textOf(raw.activity);
  return {
    phase: typeof raw.phase === "string" ? raw.phase : "uploading",
    total: countOf(raw.total), uploaded: countOf(raw.uploaded),
    failed: countOf(raw.failed), listed: countOf(raw.listed),
    // Readiness is reported only once the helper has seen it.
    ...(countOf(raw.ready) > 0 ? { ready: countOf(raw.ready) } : {}),
    reloads: countOf(raw.reloads),
    ...(countOf(raw.batch) > 0 ? { batch: countOf(raw.batch) } : {}),
    ...(wait !== null ? { wait } : {}),
    ...(activity !== null ? { activity } : {}),
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

/**
 * "Retry now": asks the helper to cut its running retry timer short. True only
 * when a timer was running and was skipped; a deadline, an idle run, a helper
 * that is gone or too old to know the route all answer false — never an error.
 */
export async function gettyWebSkipWait(
  bridgeUrl: string,
  sessionKey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${trimSlash(bridgeUrl)}/getty-web/skip-wait`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionKey }),
    });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return isRecord(body) && body.ok === true && body.skipped === true;
  } catch {
    return false;
  }
}

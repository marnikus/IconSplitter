// gettywebparse.ts — turning the loopback helper's answers into the typed results
// the run reads: which names Getty accepted, rejected, received-but-never-validated
// or merely listed, with every reason scrubbed before it can reach the log.

import { isRecord } from "../isrecord";
import { redactCredentials, type FtpCredentials } from "./credvault";
import type { GettyWebErrorCode, GettyWebRejection, GettyWebResult } from "./gettywebclient";

/** The reason a failed request reports, with the credentials scrubbed out. */
function failureReason(raw: unknown, creds: FtpCredentials, status: number): string {
  const text = isRecord(raw) && typeof raw.reason === "string" ? raw.reason.trim() : "";
  return text !== "" ? redactCredentials(text, creds) : `Getty web upload failed (HTTP ${status})`;
}

interface PageLists { accepted: string[]; failed: GettyWebRejection[]; notReady: string[]; seen: string[] }

/** The name lists a page reading reports; an absent one is empty, never a claim. */
function pageLists(raw: Record<string, unknown>): PageLists {
  return {
    accepted: nameList(raw.accepted), failed: failedEntries(raw),
    notReady: nameList(raw.notReady), seen: nameList(raw.seen),
  };
}

/** Only lists that carry names travel: an absent one never claims anything. */
function presentLists(lists: PageLists) {
  return {
    ...(lists.accepted.length > 0 ? { accepted: lists.accepted } : {}),
    ...(lists.failed.length > 0 ? { failed: lists.failed } : {}),
    ...(lists.notReady.length > 0 ? { notReady: lists.notReady } : {}),
    ...(lists.seen.length > 0 ? { seen: lists.seen } : {}),
  };
}

export function parseFailure(raw: unknown, creds: FtpCredentials, status: number): { ok: false; code: GettyWebErrorCode; reason: string } {
  const code = refusedSize(status) ? "too-large" : isRecord(raw) && typeof raw.code === "string" ? raw.code as GettyWebErrorCode : "page";
  const reason = failureReason(raw, creds, status);
  // A failed batch still says what it accepted: those icons are not re-sent.
  return isRecord(raw)
    ? { ok: false, code, reason, ...presentLists(pageLists(raw)) }
    : { ok: false, code, reason };
}

function metadataEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.metadata)) return [];
  return raw.metadata.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name), status: typeof entry.status === "string" ? entry.status : "unknown",
    ...(isRecord(entry.fields) ? { fields: entry.fields as Record<string, boolean> } : {}),
  }));
}

function failedEntries(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.failed)) return [];
  return raw.failed.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name), id: typeof entry.id === "string" ? entry.id : null,
  }));
}

function completionOf(raw: Record<string, unknown>) {
  if (!isRecord(raw.completion)) return null;
  const { clicked, label, confirmed } = raw.completion;
  return {
    clicked: clicked === true, confirmed: confirmed === true,
    label: typeof label === "string" ? label : null,
  };
}

function nameList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : [];
}

export function parseSuccess(raw: unknown, fallback: string[]): GettyWebResult {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false, code: "page", reason: "unexpected helper response" };
  const lists = pageLists(raw);
  return {
    ok: true,
    batchId: typeof raw.batchId === "string" ? raw.batchId : null,
    accepted: lists.accepted.length > 0 ? lists.accepted : fallback,
    failed: lists.failed,
    // Absent means "nothing was left unvalidated / not proven ready", never a claim.
    ...(lists.notReady.length > 0 ? { notReady: lists.notReady } : {}),
    ...(lists.seen.length > 0 ? { seen: lists.seen } : {}),
    completed: raw.completed === true,
    ...(raw.ready === true ? { ready: true } : {}),
    completion: completionOf(raw),
    metadata: metadataEntries(raw),
  };
}


/** A helper answer that is not JSON still has a status worth reporting. */
/**
 * 413/431 is the helper refusing the request's **size**, not its content: the run
 * answers it by sending the same icons as two smaller batches.
 */
function refusedSize(status: number): boolean {
  return status === 413 || status === 431;
}

export function unreadableAnswer(status: number): GettyWebResult {
  const tooLarge = refusedSize(status) ? " — the batch is larger than the helper's upload limit (GETTY_WEB_MAX_BYTES)" : "";
  const code = refusedSize(status) ? "too-large" : "page";
  return { ok: false, code, reason: `the local helper answered HTTP ${status}${tooLarge}` };
}

/** Reads the helper's JSON answer; null when it sent something else (an error page). */
export async function answerOf(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}


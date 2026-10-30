// gettywebresult.ts — the shape of what the loopback Getty web helper answers,
// and the parsers that read it without inventing anything: an absent list means
// "nothing was proven", never "everything was fine". A picture on a card is
// arrival; only a card carrying Getty's own "Ready to submit" chip is ready.

import { isRecord } from "../isrecord";

export type GettyWebErrorCode = "helper-down" | "bad-request" | "auth" | "browser" | "page" | "timeout" | "cancelled" | "network";

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

/**
 * One contribution's own outcome, exactly as Getty's cards stated it:
 * `arrived` = the picture is there (bytes in, nothing proven), `ready` = the
 * "Ready to submit" chip is there (the upload proof), `failed` = Getty's own
 * "Upload failed". A page that could not be read leaves the state `pending`.
 */
export interface GettyWebOutcome {
  name: string;
  stem: string;
  state: "pending" | "arrived" | "ready" | "failed";
  picture: boolean;
  ready: boolean;
  id: string | null;
}

export type GettyWebResult =
  | {
    ok: true; batchId: string | null;
    /** Names whose card carries Getty's "Ready to submit" icon: the upload proof. */
    accepted: string[];
    /** Names Getty answered with "Upload failed" — never counted as uploaded. */
    failed?: GettyWebRejection[];
    /** The reading came from rendered cards, so readiness is real. */
    verified?: boolean;
    /** Some contributions are ready and some failed; the batch is not complete. */
    partial?: boolean;
    /** Still listed but not validated when the helper answered. */
    pending?: string[];
    /** Per-contribution truth, one entry per distinct stem. */
    outcomes?: GettyWebOutcome[];
    /** A batch-level sentence that does not change any file's outcome. */
    batchNote?: string | null;
    completed: boolean;
    /**
     * Every contribution carried Getty's own "Ready to submit" validation icon,
     * so the batch is finished even when the page offers no Complete/Submit
     * control to click. Nothing else — a thumbnail least of all — sets this.
     */
    ready?: boolean;
    completion: { clicked: boolean; label: string | null; confirmed: boolean } | null;
    metadata: GettyWebFileReport[];
    /** Set when this upload only filled the batch; the run submits it at the end. */
    deferCompletion?: boolean;
  }
  | { ok: false; code: GettyWebErrorCode; reason: string };

/** The proven-success branch of a helper answer. */
export type GettyWebSuccess = Extract<GettyWebResult, { ok: true }>;

export function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((name): name is string => typeof name === "string" && name !== "");
}

function metadataEntries(raw: Record<string, unknown>): GettyWebFileReport[] {
  if (!Array.isArray(raw.metadata)) return [];
  return raw.metadata.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    status: typeof entry.status === "string" ? entry.status : "unknown",
    ...(isRecord(entry.fields) ? { fields: entry.fields as Record<string, boolean> } : {}),
  }));
}

function failedEntries(raw: Record<string, unknown>): GettyWebRejection[] {
  if (!Array.isArray(raw.failed)) return [];
  return raw.failed.filter((entry) => isRecord(entry) && typeof entry.name === "string").map((entry) => ({
    name: String(entry.name),
    id: typeof entry.id === "string" ? entry.id : null,
  }));
}

function oneOutcome(entry: unknown): GettyWebOutcome | null {
  if (!isRecord(entry) || typeof entry.stem !== "string") return null;
  const state = entry.state === "ready" || entry.state === "failed" || entry.state === "arrived" ? entry.state : "pending";
  return {
    name: typeof entry.name === "string" ? entry.name : entry.stem,
    stem: entry.stem,
    state,
    picture: entry.picture === true,
    ready: entry.ready === true,
    id: typeof entry.id === "string" ? entry.id : null,
  };
}

function outcomeEntries(raw: Record<string, unknown>): GettyWebOutcome[] {
  if (!Array.isArray(raw.outcomes)) return [];
  return raw.outcomes.flatMap((entry) => {
    const one = oneOutcome(entry);
    return one === null ? [] : [one];
  });
}

function completionOf(raw: Record<string, unknown>) {
  if (!isRecord(raw.completion)) return null;
  return {
    clicked: raw.completion.clicked === true,
    label: typeof raw.completion.label === "string" ? raw.completion.label : null,
    confirmed: raw.completion.confirmed === true,
  };
}

/**
 * A success response keeps the helper's own verdicts. Nothing is inferred: an
 * absent `accepted` means "nothing was proven ready", never "every file arrived".
 */
export function parseGettySuccess(raw: unknown): GettyWebResult {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false, code: "page", reason: "unexpected helper response" };
  return {
    ok: true,
    batchId: typeof raw.batchId === "string" ? raw.batchId : null,
    accepted: stringList(raw.accepted),
    failed: failedEntries(raw),
    verified: raw.verified === true,
    partial: raw.partial === true,
    pending: stringList(raw.pending),
    outcomes: outcomeEntries(raw),
    batchNote: typeof raw.batchNote === "string" ? raw.batchNote : null,
    completed: raw.completed === true,
    // Absent means "not proven ready", never "ready".
    ...(raw.ready === true ? { ready: true } : {}),
    completion: completionOf(raw),
    metadata: metadataEntries(raw),
  };
}

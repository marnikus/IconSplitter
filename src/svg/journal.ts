// journal.ts — what was in flight when the app stopped (RULE 4/13/23).
// A generation can be minutes long: if the tab is closed, the machine sleeps or
// the connection dies, the provider may still be working on the request. This
// module keeps the minimum needed to be honest about that — which request, for
// which files, since when, and under which provider request id — so the next
// boot can say "outcome unknown, here is the id" instead of silently sending
// the same (possibly billable) request again. It stores nothing else: the key,
// the prompt and the answer never touch it.
//
// Competing with the sidecar is deliberate: the sidecar is the durable record
// of COMPLETED work, this is a small, self-clearing note about work that is
// still open. A corrupt payload reads as empty (RULE 13) — losing the note can
// never break the tab.

import { isRecord } from "../lib/isrecord";

const KEY = "iconSplitter.svg.inflight.v1";
const VERSION = 1;

export interface InflightRequest {
  /** Run this request belongs to (one confirmation = one run). */
  runId: string;
  /** The plan id, e.g. batch_1_4 — unique within a run. */
  batchId: string;
  /** 1-based index of the request in its run. */
  index: number;
  sourceIds: string[];
  sourceNames: string[];
  model: string;
  /** ISO timestamp of the send. */
  startedAt: string;
  /** Provider request id, null until the header or the stream provides one. */
  requestId: string | null;
}

/** A fresh run id: one confirmation = one run, and one journal scope. */
export function newRunId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `run_${Date.now().toString(36)}_${random}`;
}

/** Every request that was started and has no confirmed outcome yet. */
export function loadInflight(): InflightRequest[] {
  return read().requests;
}

/** Records a request as in flight, replacing an earlier entry for its batch. */
export function beginRequest(record: Omit<InflightRequest, "requestId">): void {
  const kept = read().requests.filter((entry) => entry.batchId !== record.batchId);
  write([...kept, { ...record, requestId: null }]);
}

/** Keeps the provider's id as soon as it is known (header or first SSE frame). */
export function attachRequestId(batchId: string, requestId: string): void {
  const { requests } = read();
  if (!requests.some((entry) => entry.batchId === batchId)) return;
  write(requests.map((entry) => (entry.batchId === batchId ? { ...entry, requestId } : entry)));
}

/** The request has a confirmed outcome (saved, failed or cancelled): drop it. */
export function endRequest(batchId: string): void {
  const { requests } = read();
  if (!requests.some((entry) => entry.batchId === batchId)) return;
  write(requests.filter((entry) => entry.batchId !== batchId));
}

/** Forgets every note — used after the user dismisses the recovery banner. */
export function clearInflight(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing was persisted to begin with */
  }
}

/** The one line the recovery note shows: how many, which ids, which files. */
export function inflightSummary(requests: readonly InflightRequest[]): string {
  const count = requests.length;
  const parts = requests.map((entry) => {
    const id = entry.requestId ?? "no request id";
    return `${entry.batchId} · ${id} · ${entry.sourceNames.join(", ")}`;
  });
  return `${count} request${count === 1 ? "" : "s"} had no confirmed outcome — their state is unknown. `
    + `Nothing has been resent. ${parts.join(" | ")}`;
}

interface Stored {
  requests: InflightRequest[];
}

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== VERSION || !Array.isArray(parsed.requests)) return { requests: [] };
    return { requests: parsed.requests.filter(isRequest) };
  } catch {
    return { requests: [] };
  }
}

function write(requests: InflightRequest[]): void {
  try {
    if (requests.length === 0) return window.localStorage.removeItem(KEY);
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, requests }));
  } catch {
    /* storage full or blocked: the run continues, only the note is lost */
  }
}

function isRequest(value: unknown): value is InflightRequest {
  if (!isRecord(value)) return false;
  const started = value.startedAt;
  return typeof value.runId === "string" && typeof value.batchId === "string"
    && typeof value.index === "number" && typeof value.model === "string"
    && typeof started === "string" && Array.isArray(value.sourceIds) && Array.isArray(value.sourceNames)
    && (value.requestId === null || typeof value.requestId === "string");
}

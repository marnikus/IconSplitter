// jobstore.ts — where the LAST run of each icon is remembered between sessions
// (design §16). Same shape as metastore.ts: one key, one validated payload, one
// module-scope store, so the panel binds one value and the export queue can write
// the outcome it just produced.
//
// The interesting rule is `rememberJobs`: a restart must not re-arm work. A job
// that was `running` or `queued` when the app closed comes back as `interrupted`
// — visible, retryable by a deliberate click, and never resent on its own (the
// same mapping `restoreInterrupted` already owns, called here rather than copied).

import { restoreInterrupted } from "./jobctl";
import { JOB_KINDS, type JobKind } from "../lib/svgupload/rows";
import { readKey, writeKey } from "../state/safestorage";

export const UPLOAD_JOBS_KEY = "iconSplitter.upload.jobs.v1";

export interface JobStore {
  /** One state per pair id, the last thing that happened to it. */
  states: Record<string, JobKind>;
}

export function emptyJobStore(): JobStore {
  return { states: {} };
}

/** Keeps the states that are real job states and drops every other entry. */
export function parseJobStore(raw: unknown): JobStore {
  if (raw === null || typeof raw !== "object") return emptyJobStore();
  const states = (raw as { states?: unknown }).states;
  if (states === null || typeof states !== "object") return emptyJobStore();
  const kept: Record<string, JobKind> = {};
  for (const [id, value] of Object.entries(states as Record<string, unknown>)) {
    if (typeof value === "string" && (JOB_KINDS as readonly string[]).includes(value)) kept[id] = value as JobKind;
  }
  return { states: kept };
}

export function loadJobStore(): JobStore {
  const text = readKey(UPLOAD_JOBS_KEY);
  if (!text) return emptyJobStore();
  try {
    return parseJobStore(JSON.parse(text));
  } catch {
    return emptyJobStore();
  }
}

export function saveJobStore(store: JobStore): void {
  writeKey(UPLOAD_JOBS_KEY, JSON.stringify(store));
}

// --- the in-memory store the panel binds (React-free on purpose) -------------
let current: JobStore | null = null;
const listeners = new Set<() => void>();

export function getJobStore(): JobStore {
  current ??= loadJobStore();
  return current;
}

export function setJobStore(next: JobStore): void {
  current = next;
  saveJobStore(next);
  for (const notify of listeners) notify();
}

export function subscribeJobStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remembers the last outcome of each icon; a run that ends writes it here. */
export function rememberOutcome(id: string, state: JobKind): void {
  setJobStore({ states: { ...getJobStore().states, [id]: state } });
}

/** Test seam: forget the cached value so the next read hits storage again. */
export function resetJobStoreCache(): void {
  current = null;
}

/**
 * What a restart may do with the stored states: unfinished work becomes
 * interrupted, finished work is kept as it was, and the user is told how many
 * icons need a look — without a single request being sent.
 */
export function rememberJobs(previous: Record<string, JobKind>): { states: Record<string, JobKind>; note: string | null } {
  return restoreInterrupted(previous);
}

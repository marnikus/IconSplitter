// jobstore.ts — where the LAST run of each icon is remembered between sessions
// (CP-2 / merge-report §9). One key, one validated payload, one bounded map, so
// the panel and the export queue cannot disagree about what was running.
//
// The rule that matters: a restart must not re-arm (and must never re-BILL)
// work. A job that was `queued` or `running` when the app closed comes back as
// `interrupted` — visible, retryable by a deliberate click, never re-sent on
// its own. The restore note is emitted at most once per page load, so a
// StrictMode double-invoke cannot log it twice.

import { readKey, writeKey } from "../state/safestorage";

export const UPLOAD_JOBS_KEY = "iconSplitter.upload.jobs.v1";
export const JOB_STORE_VERSION = 1;
/** A folder far past the report's 400-icon marathon still fits. */
export const JOB_STORE_LIMIT = 1024;

export const JOB_STATES = [
  "queued", "running", "processed", "partial", "failed", "cancelled", "interrupted",
] as const;

export type UploadJobState = (typeof JOB_STATES)[number];

export interface JobStore {
  states: Record<string, UploadJobState>;
}

export function emptyJobStore(): JobStore {
  return { states: {} };
}

/** Keeps the entries that are real job states and drops every other one. */
export function parseJobStore(raw: unknown): JobStore {
  if (typeof raw !== "object" || raw === null) return emptyJobStore();
  const states = (raw as { states?: unknown }).states;
  if (typeof states !== "object" || states === null) return emptyJobStore();
  const kept: Record<string, UploadJobState> = {};
  for (const [id, value] of Object.entries(states as Record<string, unknown>)) {
    if (isJobState(value)) kept[id] = value;
  }
  return { states: bounded(kept) };
}

function isJobState(value: unknown): value is UploadJobState {
  return typeof value === "string" && (JOB_STATES as readonly string[]).includes(value);
}

/** Insertion order is the age order: the oldest ids go first, never the newest. */
function bounded(states: Record<string, UploadJobState>): Record<string, UploadJobState> {
  const ids = Object.keys(states);
  if (ids.length <= JOB_STORE_LIMIT) return states;
  const out: Record<string, UploadJobState> = {};
  for (const id of ids.slice(ids.length - JOB_STORE_LIMIT)) out[id] = states[id];
  return out;
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
  writeKey(UPLOAD_JOBS_KEY, JSON.stringify({ v: JOB_STORE_VERSION, states: bounded(store.states) }));
}

/** Records one icon's latest state (read-modify-write through the same parser). */
export function rememberJob(id: string, state: UploadJobState): void {
  const store = loadJobStore();
  saveJobStore({ states: { ...store.states, [id]: state } });
}

/**
 * The ids whose last remembered run needs review: in flight now (`queued` /
 * `running`) or left unresolved by an earlier session (`interrupted`). The list
 * is stable across the once-per-load mark, so the ROWS can read it after the
 * note has already been taken.
 */
export function interruptedIds(store: JobStore = loadJobStore()): string[] {
  return Object.entries(store.states)
    .filter(([, state]) => state === "queued" || state === "running" || state === "interrupted")
    .map(([id]) => id);
}

/** Turns every in-flight entry into `interrupted` and returns how many moved. */
export function markInterrupted(store: JobStore = loadJobStore()): { store: JobStore; count: number } {
  const states: Record<string, UploadJobState> = { ...store.states };
  let count = 0;
  for (const id of inFlightIds(store)) {
    states[id] = "interrupted";
    count += 1;
  }
  const next = { states };
  if (count > 0) saveJobStore(next);
  return { store: next, count };
}

/** The two states a live session owns; everything else is a finished outcome. */
function inFlightIds(store: JobStore): string[] {
  return Object.entries(store.states)
    .filter(([, state]) => state === "queued" || state === "running")
    .map(([id]) => id);
}

let restored = false;

/**
 * The once-per-load restore note. Returns how many icons need review the FIRST
 * time it is asked in this page load, and null afterwards — a StrictMode double
 * mount, a remount or a second panel gets no second entry (CP-2).
 */
export function takeRestoreNote(): number | null {
  if (restored) return null;
  restored = true;
  const { count } = markInterrupted();
  return count > 0 ? count : null;
}

/** Tests only: forget that this page load already reported its restore. */
export function forgetRestoreNote(): void {
  restored = false;
}

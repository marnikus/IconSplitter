// logstore.ts — the one global log store, above every tab (feature §2/§4).
//
// Workbench renders one panel at a time, so a log that lived in a panel would
// die on every tab switch. This module-scope store is the owner instead — the
// same shape as state/appstore (React-free, bindable with useSyncExternalStore,
// testable without a DOM). It owns the entries, the cap, the minimized state,
// the subscription and the persistence; lib/log owns every rule about what an
// entry may contain (RULE 3/13).

import {
  appendEntry, clampLogMax, createEntry, emptyLogPayload, parseLogPayload, serializeLog,
  type LogEntry, type LogPayload, type LogSpec,
} from "../lib/log";
import { readKey, writeKey } from "../state/safestorage";

export const LOG_KEY = "iconSplitter.log.v1";
/** A burst of run events becomes one write; pagehide/unmount flushes the rest. */
const PERSIST_MS = 150;

export interface LogState {
  /** Displayed AND stored maximum — one value, one control (RULE 10). */
  max: number;
  minimized: boolean;
  /** Oldest first; the panel shows them in this order and follows the tail. */
  entries: LogEntry[];
}

type Listener = () => void;

let state: LogState = load();
let seq = 0;
let timer = 0;
const listeners = new Set<Listener>();

export function getLogState(): LogState {
  return state;
}

export function subscribeLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Records one entry — sanitised by lib/log, capped, and written shortly after. */
export function log(spec: LogSpec): void {
  const now = new Date();
  seq += 1;
  const entry = createEntry(spec, now.toISOString(), `l${now.getTime().toString(36)}-${seq}`);
  commit({ ...state, entries: appendEntry(state.entries, entry, state.max) }, false);
}

/** Clearing is itself an action: one honest entry says the log was cleared. */
export function clearLog(): void {
  commit({ ...state, entries: [] }, true);
  log({ feature: "log", action: "cleared", detail: "the activity log was cleared by the user" });
  flushLog();
}

/** The cap trims what is displayed and stored immediately, in the same render. */
export function setLogMax(raw: number): void {
  const max = clampLogMax(raw);
  if (max === state.max) return;
  commit({ ...state, max, entries: state.entries.slice(-max) }, true);
  log({ feature: "log", action: "max-entries", detail: `the log keeps the newest ${max} entries`, data: { max } });
}

export function setLogMinimized(minimized: boolean): void {
  if (minimized === state.minimized) return;
  commit({ ...state, minimized }, true);
  log({ level: "debug", feature: "log", action: minimized ? "minimized" : "restored" });
}

/** Writes what the panel shows right now: pagehide, unmount, and tests. */
export function flushLog(): void {
  cancelTimer();
  writeKey(LOG_KEY, serializeLog(state));
}

/** Boot and test isolation: re-read storage (a restart, honestly simulated). */
export function resetLogStore(): void {
  cancelTimer();
  state = load();
  notify();
}

function commit(next: LogState, now: boolean): void {
  state = next;
  notify();
  if (now) flushLog();
  else schedule();
}

function schedule(): void {
  if (timer !== 0) return;
  timer = window.setTimeout(() => {
    timer = 0;
    writeKey(LOG_KEY, serializeLog(state));
  }, PERSIST_MS);
}

function cancelTimer(): void {
  if (timer === 0) return;
  window.clearTimeout(timer);
  timer = 0;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function load(): LogState {
  const payload: LogPayload = parseLogPayload(readKey(LOG_KEY));
  const fallback = emptyLogPayload();
  return {
    max: payload.max ?? fallback.max,
    minimized: payload.minimized,
    entries: payload.entries,
  };
}

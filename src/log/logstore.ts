// logstore.ts — the global log's memory (log-contract.md §2/§6, L-1/L-6/L-7).
// ONE module-scope array that every tab shares and no unmount can lose: the
// store is the only writer (`record`), and it sanitises BEFORE anything is
// stored. What it holds is what is displayed, what is persisted (within the
// byte budget) and what Copy-all writes — one array, one maximum (RULE 24).
// Features never import this; they use logger.ts. The dock reads it through
// useLog. The log is not a timeline: nothing here is undoable (L-3).

import { admit, emptyBuffer, trimTo, type LogBuffer } from "../lib/logbuffer";
import type { LogEntry, LogInput, ParsedLog } from "../lib/logentry";
import { formatAll } from "../lib/logformat";
import { DEFAULT_LOG_PREFS, MAX_CHOICES, type LogPrefs } from "../lib/logprefs";
import { sanitizeInput } from "../lib/logredact";
import { createSaver, savePrefs } from "./logstorage";
import { listSecrets, resetSecrets } from "./secrets";
import { isoNow, nextStamp, resetSession } from "./session";

export type Persist = "ok" | "unavailable";
export type Restore = "none" | "corrupt";

/** One immutable object per change, so a subscriber can compare by identity. */
export interface LogSnapshot {
  entries: readonly LogEntry[];
  prefs: LogPrefs;
  /** `unavailable` = the browser refused the last write: entries last until reload. */
  persist: Persist;
  /** `corrupt` = the stored log could not be read and the log started empty. */
  restore: Restore;
  /** Entries that could not be recorded because logging itself failed (L-2). */
  dropped: number;
}

let buf: LogBuffer = emptyBuffer();
let prefs: LogPrefs = { ...DEFAULT_LOG_PREFS };
let persist: Persist = "ok";
let restore: Restore = "none";
let dropped = 0;
let snap: LogSnapshot = makeSnap();
const listeners = new Set<() => void>();
const saver = createSaver(() => buf.entries, onSaved);

function makeSnap(): LogSnapshot {
  return { entries: buf.entries, prefs, persist, restore, dropped };
}

function publish(): void {
  snap = makeSnap();
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      dropped += 1; // a broken subscriber must not break logging; it is counted and the dock shows it
    }
  }
}

export const getLog = (): LogSnapshot => snap;

export function subscribeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Same words about the same things. Two sources failing with one message are two facts, so the ids are part of the key. */
const foldKey = (i: LogInput): string =>
  i.fold ?? `${i.feature}|${i.action}|${i.level}|${i.message}|${Object.values(i.ids ?? {}).join(",")}`;

/** The one writer: sanitise, stamp, admit, publish, schedule the write. An error is written at once. */
export function record(input: LogInput): void {
  const clean = sanitizeInput(input, listSecrets());
  const entry: LogEntry = {
    v: 1, ...nextStamp(), level: clean.level, feature: clean.feature, action: clean.action,
    message: clean.message, ids: clean.ids ?? {}, data: clean.data ?? {},
  };
  if (clean.usage !== undefined) entry.usage = clean.usage;
  buf = admit(buf, entry, { now: Date.now(), max: prefs.max, fold: foldKey(clean) });
  publish();
  saver.schedule(clean.level === "error");
}

/** Logging itself failed: count it, so the dock can say so instead of staying silent (RULE 2). */
export function noteDropped(): void {
  dropped += 1;
  snap = makeSnap();
}

function onSaved(ok: boolean): void {
  const was = persist;
  persist = ok ? "ok" : "unavailable";
  if (was === "ok" && !ok) {
    record({ level: "warn", feature: "app", action: "storage.failed", message: "The browser refused to save the log — entries last until reload", data: { where: "log" } });
  } else {
    publish();
  }
}

export const flushLog = (): void => saver.flush();

/** Boot: persisted entries first, then anything logged before boot, trimmed to the stored maximum. */
export function hydrate(restored: ParsedLog, loaded: LogPrefs): void {
  prefs = loaded;
  restore = restored.status === "corrupt" ? "corrupt" : "none";
  buf = trimTo(emptyBuffer([...restored.entries, ...buf.entries]), prefs.max);
  publish();
  if (restore === "corrupt") {
    record({ level: "warn", feature: "log", action: "restore.failed", message: "The stored log could not be read — started empty" });
  }
}

/** The one "max entries" choice: stored AND displayed, applied at once, and the loss is recorded. */
export function setMax(max: number): void {
  if (!(MAX_CHOICES as readonly number[]).includes(max) || max === prefs.max) return;
  const from = prefs.max;
  const before = buf.entries.length;
  prefs = { ...prefs, max };
  buf = trimTo(buf, max);
  savePrefs(prefs);
  const lost = before - buf.entries.length;
  record({
    level: lost > 0 ? "warn" : "info", feature: "log", action: "max",
    message: `Max entries ${from} → ${max}${lost > 0 ? `, ${lost} oldest dropped` : ""}`, data: { from, to: max, dropped: lost },
  });
}

export function setMinimized(minimized: boolean): void {
  if (minimized === prefs.minimized) return;
  prefs = { ...prefs, minimized };
  savePrefs(prefs);
  publish();
}

/** Empties memory and storage, then leaves one breadcrumb that says how many went. */
export function clearLog(): void {
  const removed = buf.entries.length;
  buf = emptyBuffer();
  record({ level: "info", feature: "log", action: "clear", message: `Log cleared — ${removed} entries removed`, data: { removed } });
  saver.flush();
}

/** The Copy-all text: what is stored, scrubbed once more with the secrets known NOW. */
export const copyAllText = (): string => formatAll(buf.entries, isoNow(), listSecrets());

/** Tests: empties MEMORY (never storage), the secrets and the session. */
export function resetLog(): void {
  saver.reset();
  buf = emptyBuffer();
  prefs = { ...DEFAULT_LOG_PREFS };
  persist = "ok";
  restore = "none";
  dropped = 0;
  resetSecrets();
  resetSession();
  publish();
}

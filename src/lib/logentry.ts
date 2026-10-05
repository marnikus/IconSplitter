// logentry.ts — the global log's entry schema and its storage form
// (log-contract.md §3/§7). Owns: the types, the shape guard, parsing a stored
// payload (a damaged or tampered one costs one ignored load and never a secret
// — every entry is re-sanitised on read, RULE 13/20) and serialising within a
// byte budget. Pure; it never throws. The vocabulary lives in logredact, the
// lowest layer, so redaction and schema never import each other.

import { isRecord } from "./isrecord";
import { ACTION_RE, LOG_DATA_KEYS, LOG_FEATURES, LOG_ID_KEYS, LOG_LEVELS, sanitizeEntry } from "./logredact";

export { LOG_DATA_KEYS, LOG_FEATURES, LOG_LEVELS } from "./logredact";

export type LogLevel = "info" | "warn" | "error";
/** `selection` covers both review tabs. */
export type LogFeature = "app" | "history" | "log" | "sheets" | "batch" | "selection" | "svg";
export type LogValue = string | number | boolean | null;

export interface LogIds { run?: string; batch?: string; request?: string; source?: string; hist?: string }

/** Same shape as lib/svgrequest Usage: `cost` is provider-reported, `estimated` is calculated — never merged (I-18). */
export interface LogUsage {
  input: number | null;
  output: number | null;
  total: number | null;
  cost: number | null;
  estimated: number | null;
  currency: string;
}

/** What a feature hands the logger. `fold` groups entries that are one gesture. */
export interface LogInput {
  level: LogLevel;
  feature: LogFeature;
  action: string;
  message: string;
  ids?: LogIds;
  data?: Record<string, LogValue>;
  usage?: LogUsage;
  fold?: string;
}

export interface LogEntry {
  v: 1;
  /** `${sid}-${n}`, monotonic per session, never reused. */
  id: string;
  /** ISO-8601 UTC with milliseconds, from the logger's clock. */
  at: string;
  /** One per page load; the list draws a break where it changes. */
  sid: string;
  level: LogLevel;
  feature: LogFeature;
  action: string;
  message: string;
  ids: LogIds;
  data: Record<string, LogValue>;
  usage?: LogUsage;
  /** How many times this entry happened within the fold window (absent = once). */
  repeat?: number;
}

export type ParseStatus = "empty" | "ok" | "corrupt";
export interface ParsedLog { entries: LogEntry[]; status: ParseStatus }

export const LOG_VERSION = 1;
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const CORRUPT: ParsedLog = { entries: [], status: "corrupt" };

type Check = (x: Record<string, unknown>) => boolean;
const matches = (re: RegExp, v: unknown): boolean => typeof v === "string" && re.test(v);
const primitive = (v: unknown): boolean => v === null || ["string", "number", "boolean"].includes(typeof v);
const numberOrNull = (v: unknown): boolean => v === null || typeof v === "number";

/** The shape every entry must have; the CONTENT of ids/data/usage is cleaned, not judged, on read. */
const SHAPE: readonly Check[] = [
  (x) => x.v === LOG_VERSION,
  (x) => matches(ID_RE, x.id) && matches(ID_RE, x.sid) && matches(AT_RE, x.at),
  (x) => LOG_LEVELS.includes(x.level as LogLevel) && LOG_FEATURES.includes(x.feature as LogFeature),
  (x) => typeof x.action === "string" && x.action.length <= 40 && ACTION_RE.test(x.action),
  (x) => typeof x.message === "string",
  (x) => isRecord(x.ids) && isRecord(x.data),
  (x) => x.usage === undefined || isRecord(x.usage),
];

/** What a clean entry must additionally hold — the strict reading used by isEntry. */
const CONTENT: readonly Check[] = [
  (x) => Object.entries(x.ids as Record<string, unknown>).every(([k, v]) => (LOG_ID_KEYS as readonly string[]).includes(k) && typeof v === "string"),
  (x) => Object.entries(x.data as Record<string, unknown>).every(([k, v]) => LOG_DATA_KEYS.has(k) && primitive(v)),
  (x) => x.usage === undefined || Object.values(x.usage as Record<string, unknown>).every((v) => numberOrNull(v) || typeof v === "string"),
  (x) => x.usage === undefined || ["input", "output", "total", "cost", "estimated"].every((k) => numberOrNull((x.usage as Record<string, unknown>)[k])),
  (x) => x.repeat === undefined || (Number.isInteger(x.repeat) && (x.repeat as number) >= 1),
];

const hasShape = (x: unknown): x is LogEntry => isRecord(x) && SHAPE.every((c) => c(x));

export function isEntry(x: unknown): x is LogEntry {
  return hasShape(x) && CONTENT.every((c) => c(x as unknown as Record<string, unknown>));
}

function readPayload(text: string): unknown[] | null {
  try {
    const payload: unknown = JSON.parse(text);
    return isRecord(payload) && payload.v === LOG_VERSION && Array.isArray(payload.entries) ? payload.entries : null;
  } catch {
    return null; // not JSON: reported as `corrupt` by the caller, never thrown
  }
}

/** Empty (a first run) and corrupt (a payload we could not use) are different answers (RULE 4). */
export function parseLog(text: string | null): ParsedLog {
  if (text === null || text === "") return { entries: [], status: "empty" };
  const raw = readPayload(text);
  if (raw === null) return CORRUPT;
  const entries = raw.filter(hasShape).map((e) => sanitizeEntry(e, [])).filter(isEntry);
  return raw.length > 0 && entries.length === 0 ? CORRUPT : { entries, status: "ok" };
}

/** The newest entries that fit `budget` characters, oldest first. */
export function serializeLog(entries: readonly LogEntry[], budget: number, savedAt: string): string {
  const room = budget - JSON.stringify({ v: LOG_VERSION, savedAt, entries: [] }).length;
  let used = 0;
  let from = entries.length;
  while (from > 0) {
    const size = JSON.stringify(entries[from - 1]).length + 1;
    if (used + size > room) break;
    used += size;
    from--;
  }
  return JSON.stringify({ v: LOG_VERSION, savedAt, entries: entries.slice(from) });
}

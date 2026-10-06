// log.ts — the global log's pure rules (feature §2/§3/§4). Owns: the entry
// schema, one bounded ring buffer, the redaction that every logged string goes
// through, the copy-all text, and validate-on-read for the stored payload.
//
// Pure on purpose: no clock, no ids, no storage — the store owns those, so
// these rules are testable without a DOM (RULE 3/5) and a corrupt payload can
// never crash the app (RULE 13). An entry never carries a key, an image or a
// payload: `sanitizeText`/`sanitizeData` are the only doors in.

import { isRecord } from "./isrecord";
import { redact } from "./svgsecret";

export const LOG_VERSION = 1;
/** Offered caps, smallest first — one value governs display AND storage. */
export const LOG_MAX_CHOICES = [50, 100, 200, 500, 1000];
export const DEFAULT_LOG_MAX = 200;
/** A detail line longer than this is truncated; the log is a trace, not a dump. */
export const DETAIL_MAX_CHARS = 400;
export const VALUE_MAX_CHARS = 200;
export const DATA_MAX_KEYS = 12;
export const DATA_URL_MARK = "[data-url]";

export type LogLevel = "debug" | "info" | "warn" | "error";
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export type LogIds = Record<string, string | number>;
export type LogData = Record<string, string | number | boolean | null>;

export interface LogEntry {
  /** Unique per entry, stable once created — never a row index. */
  id: string;
  /** ISO-8601 UTC timestamp. */
  at: string;
  level: LogLevel;
  /** Owning area: "app" | "history" | "svg" | "log" (free-form, short). */
  feature: string;
  /** What happened, in one slug-style token ("open-tab", "request-retry"). */
  action: string;
  /** Stable ids only — batch, source, entry. Never a payload. */
  ids: LogIds;
  /** One safe human line, redacted and truncated; null when there is nothing. */
  detail: string | null;
  /** Scalar details: counts, tokens, durations. */
  data: LogData;
  /** Schema version — a payload from another version is ignored, not trusted. */
  v: number;
}

/** What a caller may hand to the store; everything else is filled in there. */
export interface LogSpec {
  level?: LogLevel;
  feature: string;
  action: string;
  ids?: Record<string, unknown>;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface LogPayload {
  max: number;
  minimized: boolean;
  entries: LogEntry[];
}

/** Keys whose VALUE is a secret or an image: dropped before anything is kept. */
const SENSITIVE_KEY = /(^|[^a-z])(api_?key|key|secret|password|passwd|authorization|auth|bearer|credentials?|token|data_?url)$/i;
const DATA_URL_SHAPE = /data:[a-z0-9.+-]*\/?[a-z0-9.+-]*;?[a-z0-9-]*,?[A-Za-z0-9+/=%]{24,}/gi;

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/** Nonsense → the default; otherwise clamped into range and snapped to a size. */
export function clampLogMax(raw: unknown): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : Number.NaN;
  if (!Number.isFinite(value)) return DEFAULT_LOG_MAX;
  const first = LOG_MAX_CHOICES[0];
  const last = LOG_MAX_CHOICES[LOG_MAX_CHOICES.length - 1];
  if (value <= first) return first;
  if (value >= last) return last;
  return LOG_MAX_CHOICES.reduce((best, size) => (Math.abs(size - value) < Math.abs(best - value) ? size : best));
}

/** One line, redacted, data URLs replaced, whitespace collapsed, truncated. */
export function sanitizeText(text: string): string {
  const masked = redact(text).replace(DATA_URL_SHAPE, DATA_URL_MARK).replace(/\s+/g, " ").trim();
  return masked.length <= DETAIL_MAX_CHARS ? masked : `${masked.slice(0, DETAIL_MAX_CHARS)}…`;
}

/** Scalar-only details; sensitive keys and non-scalar values are not kept. */
export function sanitizeData(raw: unknown): LogData {
  if (!isRecord(raw)) return {};
  const out: LogData = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= DATA_MAX_KEYS) break;
    if (isSensitiveKey(key)) continue;
    if (typeof value === "string") out[key] = sanitizeText(value).slice(0, VALUE_MAX_CHARS);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

/** Ids are the log's join keys: strings/numbers only, redacted like any text. */
export function sanitizeIds(raw: unknown): LogIds {
  if (!isRecord(raw)) return {};
  const out: LogIds = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSensitiveKey(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = sanitizeText(value).slice(0, VALUE_MAX_CHARS);
  }
  return out;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.toLowerCase());
}

export function createEntry(spec: LogSpec, at: string, id: string): LogEntry {
  return {
    id, at, level: isLogLevel(spec.level) ? spec.level : "info",
    feature: sanitizeText(spec.feature), action: sanitizeText(spec.action),
    ids: sanitizeIds(spec.ids), detail: spec.detail === undefined ? null : sanitizeText(spec.detail),
    data: sanitizeData(spec.data), v: LOG_VERSION,
  };
}

/** Appends and drops the oldest entries beyond the cap; never mutates `entries`. */
export function appendEntry(entries: readonly LogEntry[], entry: LogEntry, max: number): LogEntry[] {
  const cap = clampLogMax(max);
  const next = [...entries, entry];
  return next.length <= cap ? next : next.slice(next.length - cap);
}

/** The one line the panel renders and Copy all hands over. */
export function formatEntry(e: LogEntry): string {
  return `${e.at} ${formatEntryBody(e)}`;
}

/** Entry text without the timestamp — what a row shows beside its own clock. */
export function formatEntryBody(e: LogEntry): string {
  const parts = [`${e.level.toUpperCase().padEnd(5)} ${e.feature}.${e.action}`];
  const ids = pairs(e.ids);
  if (ids !== "") parts.push(ids);
  if (e.detail !== null && e.detail !== "") parts.push(e.detail);
  const data = pairs(e.data);
  if (data !== "") parts.push(data);
  return parts.join(" · ");
}

function pairs(record: LogIds | LogData): string {
  return Object.entries(record)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
}

export function formatLogText(entries: readonly LogEntry[]): string {
  return entries.map(formatEntry).join("\n");
}

export function emptyLogPayload(): LogPayload {
  return { max: DEFAULT_LOG_MAX, minimized: false, entries: [] };
}

export function serializeLog(payload: LogPayload): string {
  return JSON.stringify({ v: LOG_VERSION, ...payload });
}

/** Validates field by field, re-sanitises, and falls back to defaults (RULE 13). */
export function parseLogPayload(raw: string | null): LogPayload {
  let parsed: unknown;
  try {
    parsed = raw === null || raw === "" ? null : JSON.parse(raw);
  } catch {
    return emptyLogPayload();
  }
  if (!isRecord(parsed) || parsed.v !== LOG_VERSION) return emptyLogPayload();
  const max = clampLogMax(parsed.max);
  const entries = Array.isArray(parsed.entries) ? parsed.entries.flatMap((e) => toEntry(e) ?? []) : [];
  return { max, minimized: parsed.minimized === true, entries: entries.slice(-max) };
}

/** The four string fields a stored entry must carry before anything else is read. */
interface StoredEntry extends Record<string, unknown> {
  id: string;
  at: string;
  feature: string;
  action: string;
}

function isStoredEntry(raw: unknown): raw is StoredEntry {
  if (!isRecord(raw)) return false;
  if (typeof raw.id !== "string" || raw.id === "") return false;
  if (typeof raw.at !== "string" || !Number.isFinite(Date.parse(raw.at))) return false;
  if (typeof raw.feature !== "string" || raw.feature === "") return false;
  return typeof raw.action === "string" && raw.action !== "";
}

/** A stored entry is trusted only as far as it re-validates and re-sanitises. */
function toEntry(raw: unknown): LogEntry | null {
  if (!isStoredEntry(raw)) return null;
  return {
    id: raw.id, at: raw.at, level: isLogLevel(raw.level) ? raw.level : "info",
    feature: sanitizeText(raw.feature), action: sanitizeText(raw.action),
    ids: sanitizeIds(raw.ids),
    detail: typeof raw.detail === "string" ? sanitizeText(raw.detail) : null,
    data: sanitizeData(raw.data), v: LOG_VERSION,
  };
}

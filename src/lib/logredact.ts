// logredact.ts — three layers keep a secret out of the log (log-contract.md §5).
// 1 Structure: only allow-listed keys exist, values are primitives, ids are the
//   five known keys, usage is numeric — a secret has no field to live in.
// 2 Value scrub: every string is flattened to one line and every secret-shaped
//   substring is masked (registered secrets, key shapes, Bearer values,
//   name=value pairs, URL credentials, JWTs, long hex, data URLs and base64).
// 3 Caps: the length limits, and the 2 KB limit of one serialised entry.
// Pure and idempotent; it never throws. The registry of secrets is passed in
// (RULE 3), never read from module state. This is also the lowest module of the
// log — logentry builds on its vocabulary, so the two never import each other.

import { isRecord } from "./isrecord";
import type { LogEntry, LogFeature, LogIds, LogInput, LogLevel, LogUsage, LogValue } from "./logentry";
import { redact } from "./svgsecret";

export const LOG_LEVELS: readonly LogLevel[] = ["info", "warn", "error"];
export const LOG_FEATURES: readonly LogFeature[] = ["app", "history", "log", "sheets", "batch", "selection", "svg"];
export const LOG_ID_KEYS = ["run", "batch", "request", "source", "hist"] as const;
export const ACTION_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){0,2}$/;

/** Every key the vocabulary uses; anything else is dropped, whatever its value. */
export const LOG_DATA_KEYS: ReadonlySet<string> = new Set([
  "restored", "max", "persist", "from", "to", "where", "type", "origin", "count", "gesture", "selected", "saved",
  "skipped", "failed", "approved", "missing", "unreadable", "corrupt", "model", "reasoning", "resetCount", "chars",
  "hash", "requests", "fp", "sources", "retries", "timeoutMs", "invalid", "cancelled", "cols", "rows", "attempt", "of",
  "status", "ms", "kind", "waitMs", "reason", "retryAfterMs", "position", "version", "icons", "warnings", "removed",
  "dropped", "entries", "ok", "suppressed",
]);

export const CAPS = { message: 240, text: 160, id: 64, fold: 80, keys: 24, entry: 1900 } as const;
const MASK = "‹redacted›";
const MIN_SECRET = 6;
const MAX_SCAN = 65_536;
const MIN_KEEP = 16;
const NAME = "(?:api[_-]?key|key|token|secret|passw(?:or)?d|authorization|auth|credentials?|cookie|session(?:[_-]?id)?)";

const blob = (m: string): string => `‹blob ${m.length} chars›`;

/** The scrub table, in order: data (RULE 19 step 2) — each row is one thing a secret can look like. */
const SCRUBS: ReadonlyArray<readonly [RegExp, string | ((m: string) => string)]> = [
  [/data:[a-z]+\/[a-z0-9.+-]+(?:;[a-z0-9=.-]+)*,[A-Za-z0-9+/=%_-]*/gi, blob],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}\b/g, MASK],
  [/\bBearer\s+[\w.~+/=-]{6,}/gi, `Bearer ${MASK}`],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${MASK}@`],
  [new RegExp(`([?&][\\w-]*(?:key|token|secret|sig|signature|password|auth|code|session)=)[^&\\s#]+`, "gi"), `$1${MASK}`],
  [new RegExp(`\\b((?:[\\w-]*[_.-])?${NAME})\\s*[=:]\\s*(?:"[^"]*"|'[^']*'|\\S+)`, "gi"), `$1=${MASK}`],
  [/\b[0-9a-f]{32,}\b/gi, MASK],
  [/[A-Za-z0-9+/]{120,}={0,2}/g, blob],
];

const apply = (text: string, [re, to]: (typeof SCRUBS)[number]): string =>
  (typeof to === "string" ? text.replace(re, to) : text.replace(re, to));

function maskSecrets(text: string, secrets: readonly string[]): string {
  const usable = secrets.filter((s) => typeof s === "string" && s.trim().length >= MIN_SECRET).map((s) => s.trim());
  return [...new Set(usable)].sort((a, b) => b.length - a.length).reduce((t, s) => t.split(s).join(MASK), text);
}

/** Layer 2 for one string: one line, no secret-shaped part. Too large to scan = a blob. */
export function scrubText(text: string, secrets: readonly string[]): string {
  if (text.length > MAX_SCAN) return blob(text);
  const oneLine = text.replace(/\s*[\r\n]+\s*/g, " ");
  return SCRUBS.reduce(apply, redact(maskSecrets(oneLine, secrets)));
}

/** Layer 3: cut with the count of what was cut, never beyond `max` in total. */
function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = Math.max(0, max - 10);
  return `${text.slice(0, keep)}…(+${text.length - keep})`;
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const clean = (v: unknown, max: number, secrets: readonly string[]): string => capText(scrubText(str(v), secrets), max);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

function cleanAction(v: unknown): string {
  const s = typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 40) : "";
  return ACTION_RE.test(s) ? s : "unknown";
}

function cleanIds(v: unknown, secrets: readonly string[]): LogIds {
  const out: LogIds = {};
  if (!isRecord(v)) return out;
  for (const key of LOG_ID_KEYS) {
    const text = typeof v[key] === "string" ? clean(v[key], CAPS.id, secrets) : "";
    if (text !== "") out[key] = text;
  }
  return out;
}

function readValue(source: Record<string, unknown>, key: string, secrets: readonly string[]): LogValue | undefined {
  let raw: unknown;
  try {
    raw = source[key];
  } catch {
    return undefined; // a throwing getter is a key with no value, not a failed entry
  }
  if (typeof raw === "string") return clean(raw, CAPS.text, secrets);
  if (typeof raw === "number") return num(raw);
  return typeof raw === "boolean" || raw === null ? raw : undefined;
}

function cleanData(v: unknown, secrets: readonly string[]): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  if (!isRecord(v)) return out;
  let kept = 0;
  for (const key of Object.keys(v)) {
    if (kept >= CAPS.keys || !LOG_DATA_KEYS.has(key)) continue;
    const value = readValue(v, key, secrets);
    if (value === undefined) continue;
    out[key] = value;
    kept++;
  }
  return out;
}

function cleanUsage(v: unknown): LogUsage | undefined {
  if (!isRecord(v)) return undefined;
  const currency = typeof v.currency === "string" && /^[A-Za-z]{3,8}$/.test(v.currency) ? v.currency.toUpperCase() : "USD";
  return { input: num(v.input), output: num(v.output), total: num(v.total), cost: num(v.cost), estimated: num(v.estimated), currency };
}

function build(input: unknown, secrets: readonly string[]): LogInput {
  const src = isRecord(input) ? input : {};
  const out: LogInput = {
    level: pick(LOG_LEVELS, src.level, "warn"), feature: pick(LOG_FEATURES, src.feature, "app"),
    action: cleanAction(src.action), message: clean(src.message, CAPS.message, secrets),
    ids: cleanIds(src.ids, secrets), data: cleanData(src.data, secrets),
  };
  const usage = cleanUsage(src.usage);
  if (usage !== undefined) out.usage = usage;
  if (typeof src.fold === "string") out.fold = clean(src.fold, CAPS.fold, secrets);
  return out;
}

/** Halves the longest string until the serialised input fits one entry. */
function fit(input: LogInput): LogInput {
  let out = input;
  for (let i = 0; i < 64 && JSON.stringify(out).length > CAPS.entry; i++) out = shrink(out);
  return out;
}

function shrink(i: LogInput): LogInput {
  const ids = Object.entries(i.ids ?? {});
  const data = Object.entries(i.data ?? {}).filter((e): e is [string, string] => typeof e[1] === "string");
  const longest = [["message", "", i.message], ...ids.map(([k, v]) => ["ids", k, v]), ...data.map(([k, v]) => ["data", k, v])]
    .reduce((a, b) => (b[2].length > a[2].length ? b : a));
  if (longest[2].length <= MIN_KEEP) return { ...i, data: Object.fromEntries(Object.entries(i.data ?? {}).slice(0, -1)) };
  const cut = capText(longest[2], Math.max(MIN_KEEP, Math.floor(longest[2].length / 2)));
  if (longest[0] === "message") return { ...i, message: cut };
  return { ...i, [longest[0]]: { ...(longest[0] === "ids" ? i.ids : i.data), [longest[1]]: cut } };
}

const REJECTED: LogInput = { level: "warn", feature: "log", action: "rejected", message: "an entry could not be sanitised" };

/** Layers 1–3. Idempotent; never throws — a failure yields a fixed, safe entry. */
export function sanitizeInput(input: LogInput, secrets: readonly string[]): LogInput {
  try {
    return fit(build(input, secrets));
  } catch {
    return REJECTED; // RULE 2: never silent — the dock shows this entry
  }
}

/** The same cleaning for a stored entry: the stamps are kept, the content is re-sanitised. */
export function sanitizeEntry(e: LogEntry, secrets: readonly string[]): LogEntry {
  const c = sanitizeInput(e, secrets);
  const out: LogEntry = { v: 1, id: e.id, at: e.at, sid: e.sid, level: c.level, feature: c.feature, action: c.action, message: c.message, ids: c.ids ?? {}, data: c.data ?? {} };
  if (c.usage !== undefined) out.usage = c.usage;
  if (e.repeat !== undefined) out.repeat = e.repeat;
  return out;
}

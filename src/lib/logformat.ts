// logformat.ts — one set of words for a log entry. The dock's row and the
// Copy-all text are drawn from the same helpers, so what is shown is what is
// copied (L-6). Money keeps its basis in the text: "reported" is the provider's
// number, "Estimated" is a calculation, and they are never merged (L-5).
// Pure (RULE 5): the clock arrives as a parameter.

import type { LogEntry, LogLevel, LogUsage, LogValue } from "./logentry";
import { scrubText } from "./logredact";
import { costText, fmtTokens } from "./svgusage";

/** Word first, glyph second — colour only reinforces (I-14). */
const LEVELS: Record<LogLevel, { glyph: string; word: string }> = {
  info: { glyph: "ⓘ", word: "INFO" },
  warn: { glyph: "▲", word: "WARN" },
  error: { glyph: "✖", word: "ERROR" },
};

export interface EntryParts {
  iso: string;
  /** Local HH:mm:ss.SSS. */
  time: string;
  glyph: string;
  word: string;
  feature: string;
  action: string;
  message: string;
  /** The muted part: ids, data, usage. */
  detail: string;
  repeat: number;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
const oneLine = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, " ");
const shown = (v: LogValue): string => (v === null ? "—" : String(v));

export function timeOf(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "--:--:--.---";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function usageParts(u: LogUsage | undefined): string[] {
  if (u === undefined) return [];
  return [`${fmtTokens(u.input)} in`, `${fmtTokens(u.output)} out`, costText({ reported: u.cost, estimated: u.estimated }, u.currency)];
}

/** "run r1 · batch batch_1_4 · attempt 1 · 4,100 in · 2,200 out · $0.0210 reported". */
export function detailText(e: LogEntry): string {
  const ids = Object.entries(e.ids).map(([k, v]) => `${k} ${v}`);
  const data = Object.entries(e.data).map(([k, v]) => `${k} ${shown(v)}`);
  return [...ids, ...data, ...usageParts(e.usage)].join(" · ");
}

export function entryParts(e: LogEntry): EntryParts {
  const level = LEVELS[e.level];
  return {
    iso: e.at, time: timeOf(e.at), glyph: level.glyph, word: level.word, feature: e.feature, action: e.action,
    message: oneLine(e.message), detail: detailText(e), repeat: e.repeat ?? 1,
  };
}

/** One line, ISO time — the Copy-all form of an entry. */
export function formatEntry(e: LogEntry): string {
  const p = entryParts(e);
  const detail = p.detail === "" ? "" : ` · ${p.detail}`;
  const repeat = p.repeat > 1 ? ` ×${p.repeat}` : "";
  return `${p.iso} ${p.glyph} ${p.word} ${p.feature} ${p.action} ${p.message}${detail}${repeat}`;
}

const sessionLine = (e: LogEntry): string => `— session ${e.sid} · ${e.at.slice(0, 16).replace("T", " ")} —`;

/** The Copy-all text, scrubbed once more with the secrets known NOW (one registered after storage is covered). */
export function formatAll(entries: readonly LogEntry[], now: string, secrets: readonly string[]): string {
  const lines = [`Icon Splitter log · ${entries.length} entries · exported ${now}`];
  let sid = "";
  for (const e of entries) {
    if (e.sid !== sid) lines.push(sessionLine(e));
    sid = e.sid;
    lines.push(scrubText(formatEntry(e), secrets));
  }
  return lines.join("\n");
}

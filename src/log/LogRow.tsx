// LogRow.tsx — one log entry as a single line: the clock, the level, then the
// same body text Copy all hands over (lib/log owns that text, so the row and
// the clipboard can never disagree).

import { formatEntryBody, type LogEntry } from "../lib/log";

const LEVEL_TONE: Record<LogEntry["level"], string> = {
  debug: "text-slate-500",
  info: "text-slate-300",
  warn: "text-amber-300",
  error: "text-rose-300",
};

export default function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <li data-testid="log-entry" data-level={entry.level}
      className="flex gap-2 border-b border-white/5 py-0.5 whitespace-pre-wrap break-words">
      <time dateTime={entry.at} className="shrink-0 text-slate-500">{entry.at.slice(11, 19)}</time>
      <span className={LEVEL_TONE[entry.level]}>{formatEntryBody(entry)}</span>
    </li>
  );
}

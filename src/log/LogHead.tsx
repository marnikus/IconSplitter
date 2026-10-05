// LogHead.tsx — the dock's header: what the log holds, whether it is following
// the tail, and the four controls (cap, Copy all, Clear, minimize). The rules
// behind those controls live in lib/log and logstore; this file is the wiring.

import { LOG_MAX_CHOICES, formatLogText, type LogEntry } from "../lib/log";
import { LOG_DOCK_HEAD_PX } from "./dockheight";
import { clearLog, log, setLogMax, setLogMinimized } from "./logstore";

export interface LogHeadProps {
  entries: LogEntry[];
  max: number;
  minimized: boolean;
  follow: boolean;
  note: string | null;
  setNote: (note: string) => void;
}

const BTN = "rounded border border-white/10 px-2 py-0.5 text-slate-200 transition"
  + " enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function LogHead({ entries, max, minimized, follow, note, setNote }: LogHeadProps) {
  return (
    <header className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-3 px-4"
      style={{ minHeight: LOG_DOCK_HEAD_PX }} data-testid="log-head">
      <span className="font-semibold text-slate-200">Activity log</span>
      <span data-testid="log-count">{countText(entries, max)}</span>
      <span className="text-slate-400" data-testid="log-autoscroll">
        {follow ? "following new entries" : "paused — scroll to the bottom to resume"}
      </span>
      <LogControls entries={entries} max={max} minimized={minimized} note={note} setNote={setNote} />
    </header>
  );
}

function LogControls({ entries, max, minimized, note, setNote }: Omit<LogHeadProps, "follow">) {
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Keep
        <select className="rounded border border-white/10 bg-slate-900 px-1 py-0.5" data-testid="log-max"
          aria-label="Maximum log entries" value={max} onChange={(e) => setLogMax(Number(e.target.value))}>
          {LOG_MAX_CHOICES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" className={BTN} data-testid="log-copy" disabled={entries.length === 0}
        onClick={() => void copyAll(entries, setNote)}>Copy all</button>
      <button type="button" className={BTN} data-testid="log-clear" disabled={entries.length === 0}
        onClick={() => { clearLog(); setNote("Log cleared"); }}>Clear</button>
      <button type="button" className={BTN} data-testid="log-minimize" aria-expanded={!minimized}
        onClick={() => setLogMinimized(!minimized)}>{minimized ? "Restore" : "Minimize"}</button>
      {note !== null && <span className="text-slate-400" role="status" data-testid="log-note">{note}</span>}
    </span>
  );
}

function countText(entries: readonly LogEntry[], max: number): string {
  const errors = entries.filter((e) => e.level === "error").length;
  const warns = entries.filter((e) => e.level === "warn").length;
  return [
    `${entries.length} of ${max}`,
    ...(errors > 0 ? [`${errors} error${errors === 1 ? "" : "s"}`] : []),
    ...(warns > 0 ? [`${warns} warning${warns === 1 ? "" : "s"}`] : []),
  ].join(" · ");
}

/** Copy hands over exactly what the panel shows; a blocked clipboard says so. */
async function copyAll(entries: readonly LogEntry[], note: (msg: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatLogText(entries));
    log({ level: "debug", feature: "log", action: "copied", data: { entries: entries.length } });
    note(`Copied ${entries.length} ${entries.length === 1 ? "entry" : "entries"} to the clipboard`);
  } catch {
    note("Clipboard is blocked by the browser — select the rows and copy manually");
  }
}

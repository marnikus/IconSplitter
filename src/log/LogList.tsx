// LogList.tsx — the scrolling body of the log dock. It is the element the
// auto-scroll rule watches, and the live region a screen reader announces.

import type { LogEntry } from "../lib/log";
import LogRow from "./LogRow";

export interface LogListProps {
  entries: LogEntry[];
  /** Attaches the element the follow rule reads its metrics from. */
  attach: (el: HTMLDivElement | null) => void;
  /** The dock's body height, so the list scrolls instead of growing the page. */
  heightPx: number;
}

export default function LogList({ entries, attach, heightPx }: LogListProps) {
  return (
    <div ref={attach} role="log" aria-live="polite" aria-label="Activity log" data-testid="log-body"
      style={{ height: `${heightPx}px` }}
      className="overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-5">
      {entries.length === 0
        ? <p className="py-2 text-slate-500" data-testid="log-empty">No activity recorded yet.</p>
        : (
          <ul data-testid="log-list">
            {entries.map((entry) => <LogRow key={entry.id} entry={entry} />)}
          </ul>
        )}
    </div>
  );
}

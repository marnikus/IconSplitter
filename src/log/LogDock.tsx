// LogDock.tsx — the global log, docked at the bottom of EVERY tab (feature 2 of
// the 2026-10-01 design). Workbench renders it as the LAST child inside the
// shell's flow, outside the tab conditionals, so no tab can unmount it; the
// store would survive anyway (L-7). It renders TWO elements: an in-flow spacer
// that reserves exactly the dock's height — so page content can never end up
// underneath it and lose its clicks (the parallel branch's padding-only
// clearance let the fixed dock cover the last rows' checkboxes) — and the
// fixed dock itself. It publishes its height as --log-dock-h so the spacer and
// the fixed toasts clear it. Minimised it is one 32 px bar that still counts
// entries and unseen errors — minimising never hides an error.

import { useEffect } from "react";
import "./log.css";
import type { Follow } from "../lib/logscroll";
import LogList from "./LogList";
import LogToolbar from "./LogToolbar";
import { setMinimized } from "./logstore";
import { useLog } from "./useLog";
import { useStickyScroll } from "./useStickyScroll";

const OPEN_HEIGHT = "clamp(160px, 28vh, 280px)";
const MIN_HEIGHT = "32px";

/** The clearance other fixed elements keep: its own height, and 0 once it is gone. */
function useDockHeight(minimized: boolean): void {
  useEffect(() => {
    document.documentElement.style.setProperty("--log-dock-h", minimized ? MIN_HEIGHT : OPEN_HEIGHT);
  }, [minimized]);
  useEffect(() => () => document.documentElement.style.setProperty("--log-dock-h", "0px"), []);
}

export default function LogDock() {
  const { entries, prefs, persist, restore, dropped } = useLog();
  const { follow, bind, jump } = useStickyScroll(entries, !prefs.minimized);
  useDockHeight(prefs.minimized);
  const min = prefs.minimized;
  return (
    <>
      {/* In-flow clearance: whatever scrolls the page stops above the dock. */}
      <div aria-hidden="true" data-testid="log-dock-spacer" style={{ height: "var(--log-dock-h, 0px)" }} />
      <section className={`log-dock${min ? " min" : ""}`} aria-label="Application log" data-testid="log-dock">
        <LogBar count={entries.length} follow={follow} min={min} max={prefs.max} />
        {!min && <LogList entries={entries} bind={bind} follow={follow} onJump={jump} persist={persist} restore={restore} dropped={dropped} />}
      </section>
    </>
  );
}

/** One 32 px line: the title, what the log holds, what the user has not seen, the actions and the toggle. */
function LogBar({ count, follow, min, max }: { count: number; follow: Follow; min: boolean; max: number }) {
  return (
    <header className="log-bar">
      <strong>Log</strong>
      <span data-testid="log-count">{count} entries</span>
      {follow.unseen > 0 && <span className="log-badge" data-testid="log-badge">● {follow.unseen} new</span>}
      {follow.unseenErrors > 0 && <span className="log-errors" data-testid="log-errors">✖ {follow.unseenErrors}</span>}
      {!min && <LogToolbar max={max} unseen={follow.unseen} />}
      <button type="button" className="log-btn log-toggle" data-testid="log-toggle" aria-expanded={!min}
        aria-controls="log-panel" onClick={() => setMinimized(!min)}>
        {min ? "▴ Restore log" : "▾ Minimize log"}
      </button>
    </header>
  );
}

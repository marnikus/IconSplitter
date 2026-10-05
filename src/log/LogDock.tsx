// LogDock.tsx — the global log, docked at the bottom of the app (feature §2).
// Workbench mounts it above the tabs, so it is the SAME instance on every tab,
// minimized to its header or open. The header's rules (cap, Copy all, Clear,
// follow status) live in LogHead; every rule about what an entry may contain
// lives in lib/log (RULE 3).

import { useEffect, useState } from "react";
import { flushLog } from "./logstore";
import LogHead, { LOG_DOCK_HEAD_PX } from "./LogHead";
import LogList from "./LogList";
import { useAutoScroll } from "./useAutoScroll";
import { useLog } from "./useLog";

/** Dock body height, so the spacer reserves exactly the space the dock covers. */
export const LOG_DOCK_BODY_PX = 200;

export default function LogDock() {
  const { entries, max, minimized } = useLog();
  const { follow, attach } = useAutoScroll(entries.length);
  const [note, setNote] = useState<string | null>(null);
  useFlushOnHide();
  return (
    <>
      <div style={{ height: LOG_DOCK_HEAD_PX + (minimized ? 0 : LOG_DOCK_BODY_PX) }} aria-hidden="true" />
      <section className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 text-xs text-slate-300"
        data-testid="log-dock" aria-label="Activity log">
        <LogHead entries={entries} max={max} minimized={minimized} follow={follow} note={note} setNote={setNote} />
        {!minimized && <LogList entries={entries} attach={attach} heightPx={LOG_DOCK_BODY_PX} />}
      </section>
    </>
  );
}

/** A hidden page or an unmounting dock keeps what the panel showed (RULE 13). */
function useFlushOnHide(): void {
  useEffect(() => {
    const flush = () => flushLog();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
}

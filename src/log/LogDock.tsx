// LogDock.tsx — the global log, docked at the bottom of the app (feature §2).
// Workbench mounts it as the LAST ROW of the shell column, so it is the SAME
// instance on every tab and it can only take space, never cover the panels: a
// fixed dock intercepted the clicks meant for the row checkboxes painted under
// it (design §1). The header's rules (cap, Copy all, Clear, follow status) live
// in LogHead; every rule about what an entry may contain lives in lib/log.

import { useEffect, useState } from "react";
import { dockHeightPx, LOG_DOCK_HEAD_PX, setDockHeight } from "./dockheight";
import { flushLog } from "./logstore";
import LogHead from "./LogHead";
import LogList from "./LogList";
import { useAutoScroll } from "./useAutoScroll";
import { useLog } from "./useLog";

export default function LogDock() {
  const { entries, max, minimized } = useLog();
  const { follow, attach } = useAutoScroll(entries.length);
  const [note, setNote] = useState<string | null>(null);
  useFlushOnHide();
  useDockHeight(minimized);
  return (
    <section className="app-dock" data-testid="log-dock" aria-label="Activity log">
      <LogHead entries={entries} max={max} minimized={minimized} follow={follow} note={note} setNote={setNote} />
      {!minimized && <LogList entries={entries} attach={attach} heightPx={dockHeightPx(false) - LOG_DOCK_HEAD_PX} />}
    </section>
  );
}

/** The dock's height is published for the fixed toasts (design D-log-2). */
function useDockHeight(minimized: boolean): void {
  useEffect(() => {
    setDockHeight(dockHeightPx(minimized));
    return () => setDockHeight(0);
  }, [minimized]);
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

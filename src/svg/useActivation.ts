// useActivation.ts — what happens when the user comes BACK to the Generate SVG tab
// (keep-alive D1/D5). The panel stays mounted while the user is elsewhere, so the
// list may be stale: the order is re-pinned from the rows as they are now, and the
// folder is rescanned — but only when nothing is in flight, because a scan during
// a run would wipe the rows that are generating. A run's own files are re-read
// when it ends (reloadSidecars), so nothing is lost by waiting.

import { useEffect, useRef } from "react";
import type { SvgGenApi } from "./useSvgGen";

export function useTabActivation(active: boolean, g: SvgGenApi): void {
  const was = useRef(active);
  const latest = useRef(g);
  latest.current = g;
  useEffect(() => {
    const returned = active && !was.current;
    was.current = active;
    if (returned) onReturn(latest.current);
  }, [active]);
}

function onReturn(g: SvgGenApi): void {
  g.dispatch({ type: "repin" });
  if (g.rootName !== "" && g.refs.abort.current === null) g.rescan();
}

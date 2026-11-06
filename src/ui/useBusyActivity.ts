// useBusyActivity.ts — mirrors a tab's busy text into an activity bar
// (lib/activity, 2026-11-03). Every tab already sets busy while it scans,
// loads, renders or saves, so this one hook gives ALL of that work a bar —
// including busy work added later. The bar follows the text ("Saving 3/10…"
// shows 30 %) and closes the moment busy clears. `skip` names busy work that
// already has its own job bar, so nothing is shown twice.
import { useEffect, useRef } from "react";
import { beginActivity, type ActivityHandle } from "../lib/activity";

export function useBusyActivity(source: string, busy: string | null, skip?: (busy: string) => boolean): void {
  const handle = useRef<ActivityHandle | null>(null);
  const shown = busy !== null && busy !== "" && skip?.(busy) !== true ? busy : null;
  useEffect(() => {
    if (shown === null) {
      handle.current?.end();
      handle.current = null;
      return;
    }
    if (handle.current === null) handle.current = beginActivity(source, shown);
    else handle.current.update(shown);
  }, [source, shown]);
  useEffect(() => () => { handle.current?.end(); handle.current = null; }, []);
}

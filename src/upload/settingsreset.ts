// settingsreset.ts — the ONE bulk "Reset to inherited" (2026-10-21): it CLEARS
// the selection's LOCAL general pins so those rows follow the global defaults
// again. It is not a defaults reset: the stored defaults are never written, and
// a shadow / corner badge / size guide always stays (its own checkbox is the
// only control that removes it) — so the Checked-icons boxes never untick. The
// batch and its undo entry live in selectedsettings (resetBatch).
import { useCallback, useRef } from "react";
import type { Slice, UploadCtx } from "./actions";
import { resetBatch } from "./selectedsettings";

export function useSettingsResetActions(ctx: UploadCtx): Slice<"resetOverridesSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverridesSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    if (resetBatch(c, ids, "Reset to inherited") === 0) {
      c.say("The checked icons pin no local settings — decorations stay as they are");
    }
  }, []);
  return { resetOverridesSelected };
}

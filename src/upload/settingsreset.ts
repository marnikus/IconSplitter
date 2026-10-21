// settingsreset.ts — the ONE global reset (2026-10-21, row settings isolation +
// applied decorations): it CLEARS the selection's LOCAL pins so those rows
// inherit the defaults again. A decoration the popup applied to the selection
// is not a local setting and stays (untick its checkbox to remove it), and the
// stored global defaults are never written. The batch and its undo entry live
// in selectedsettings (resetBatch).
import { useCallback, useRef } from "react";
import type { Slice, UploadCtx } from "./actions";
import { resetBatch } from "./selectedsettings";

export function useSettingsResetActions(ctx: UploadCtx): Slice<"resetOverridesSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverridesSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    if (resetBatch(c, ids, "Reset to defaults") === 0) {
      c.say("The checked icons pin no local settings");
    }
  }, []);
  return { resetOverridesSelected };
}

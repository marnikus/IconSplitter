// settingsreset.ts — the ONE global reset (2026-10-21, row settings isolation):
// it CLEARS the selection's overrides so those rows inherit the defaults again.
// No global control ever writes a defaults value into a row; only a local edit
// in that row's own dialog pins. The batch and its undo entry live in
// selectedsettings (resetBatch).
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
      c.say("The selection already inherits the global settings");
    }
  }, []);
  return { resetOverridesSelected };
}

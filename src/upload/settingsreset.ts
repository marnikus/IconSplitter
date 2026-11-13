// Selected export settings: freeze globals as local snapshots, or reset local
// pins to inheritance. Neither action changes defaults or applied decorations.
// selectedsettings owns each batch's single reducer patch and undo entry.
import { useCallback, useRef } from "react";
import type { Slice, UploadCtx } from "./actions";
import { commitLocalBatch, resetBatch } from "./selectedsettings";

export function useSelectedSettingsActions(ctx: UploadCtx): Slice<"resetOverridesSelected" | "applySettingsSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverridesSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    if (resetBatch(c, ids, "Reset to inherited") === 0) {
      c.say("The checked icons pin no local settings — decorations stay as they are");
    }
  }, []);
  const applySettingsSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    if (commitLocalBatch(c, ids) === 0) c.say("The checked icons already have these local settings — nothing changed");
  }, []);
  return { resetOverridesSelected, applySettingsSelected };
}

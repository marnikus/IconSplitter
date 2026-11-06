// sizeguideactions.ts — the checked-only size-guide opt-in: the applied guide values (not row overrides).
import { useCallback, useRef } from "react";
import { rowSettings } from "../lib/upload/decorations";
import type { Slice, UploadCtx } from "./actions";
import { commitDecoration } from "./selectedsettings";

/** Mixed means add for every check; only all-on means remove. */
export function useSizeGuideActions(ctx: UploadCtx): Slice<"toggleSizeGuideSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleSizeGuideSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => rowSettings(c.m.defaults, id, c.m.overrides, c.m.applied).sizeGuideEnabled);
    const on = !allOn;
    commitDecoration(c, ids, { key: "sizeGuide", on, label: on ? "Apply size guide" : "Remove size guide" });
  }, []);
  return { toggleSizeGuideSelected };
}

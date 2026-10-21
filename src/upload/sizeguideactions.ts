// sizeguideactions.ts — the checked-only size-guide opt-in: the flag plus its applied mark.
import { useCallback, useRef } from "react";
import { effectiveSettings } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitDecoration } from "./selectedsettings";

/** Mixed means add for every check; only all-on means remove. */
export function useSizeGuideActions(ctx: UploadCtx): Slice<"toggleSizeGuideSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleSizeGuideSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => effectiveSettings(c.m.defaults, c.m.overrides[id] ?? {}).sizeGuideEnabled);
    const on = !allOn;
    commitDecoration(c, ids, { key: "sizeGuide", on, label: on ? "Apply size guide" : "Remove size guide" });
  }, []);
  return { toggleSizeGuideSelected };
}

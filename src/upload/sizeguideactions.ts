// sizeguideactions.ts — the checked-only size-guide opt-in uses the shared settings history path.
import { useCallback, useRef } from "react";
import { effectiveSettings } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitBatch } from "./selectedsettings";

/** Mixed means add for every check; only all-on means remove. */
export function useSizeGuideActions(ctx: UploadCtx): Slice<"toggleSizeGuideSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleSizeGuideSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => effectiveSettings(c.m.defaults, c.m.overrides[id] ?? {}).sizeGuideEnabled);
    const on = !allOn;
    commitBatch(c, ids, on ? "Apply size guide" : "Remove size guide", (_id, prior) =>
      effectiveSettings(c.m.defaults, prior).sizeGuideEnabled === on ? null : { ...prior, sizeGuideEnabled: on });
  }, []);
  return { toggleSizeGuideSelected };
}

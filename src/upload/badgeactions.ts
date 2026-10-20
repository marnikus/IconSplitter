// badgeactions.ts — the checked-only badge opt-in uses the shared settings history path.
import { useCallback, useRef } from "react";
import { effectiveSettings } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitBatch } from "./selectedsettings";

/** Mixed means add for every check; only all-on means remove. */
export function useBadgeActions(ctx: UploadCtx): Slice<"toggleBadgeSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleBadgeSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => effectiveSettings(c.m.defaults, c.m.overrides[id] ?? {}).badgeEnabled);
    const on = !allOn;
    commitBatch(c, ids, on ? "Apply badge" : "Remove badge", (_id, prior) =>
      effectiveSettings(c.m.defaults, prior).badgeEnabled === on ? null : { ...prior, badgeEnabled: on });
  }, []);
  return { toggleBadgeSelected };
}

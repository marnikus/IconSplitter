// badgeactions.ts — the checked-only badge opt-in: the flag plus its applied mark.
import { useCallback, useRef } from "react";
import { effectiveSettings } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitDecoration } from "./selectedsettings";

/** Mixed means add for every check; only all-on means remove. */
export function useBadgeActions(ctx: UploadCtx): Slice<"toggleBadgeSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleBadgeSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => effectiveSettings(c.m.defaults, c.m.overrides[id] ?? {}).badgeEnabled);
    const on = !allOn;
    commitDecoration(c, ids, { key: "badge", on, label: on ? "Apply badge" : "Remove badge" });
  }, []);
  return { toggleBadgeSelected };
}

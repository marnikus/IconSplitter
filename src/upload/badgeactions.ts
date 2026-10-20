// badgeactions.ts — selected-only badge edits use the shared settings history path.
import { useCallback, useRef } from "react";
import {
  clampBadgeOffsetPct, clampBadgeWidthPct, effectiveSettings, parseBadgeCorner,
  type UploadSettings,
} from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitBatch } from "./selectedsettings";

type BadgePlacement = Pick<UploadSettings, "badgeCorner" | "badgeWidthPct" | "badgeOffsetXPct" | "badgeOffsetYPct">;
const LABELS: Record<keyof BadgePlacement, string> = {
  badgeCorner: "Set badge corner", badgeWidthPct: "Set badge width",
  badgeOffsetXPct: "Set badge X inset", badgeOffsetYPct: "Set badge Y inset",
};

/** Mixed means add for every check; only all-on means remove. */
export function useBadgeActions(ctx: UploadCtx): Slice<"toggleBadgeSelected" | "setBadgeSelected"> {
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
  const setBadgeSelected = useCallback((ids: string[], patch: Partial<BadgePlacement>) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const next = validatedPlacement(patch);
    const key = Object.keys(next)[0] as keyof BadgePlacement | undefined;
    if (key === undefined) return;
    commitBatch(c, ids, LABELS[key], (_id, prior) => {
      const effective = effectiveSettings(c.m.defaults, prior);
      if (!effective.badgeEnabled) return null;
      const same = Object.entries(next).every(([field, value]) => effective[field as keyof BadgePlacement] === value);
      return same ? null : { ...prior, ...next };
    });
  }, []);
  return { toggleBadgeSelected, setBadgeSelected };
}

/** Clamp on write too: an unexpected caller cannot pin out-of-range values. */
function validatedPlacement(patch: Partial<BadgePlacement>): Partial<BadgePlacement> {
  const next: Partial<BadgePlacement> = {};
  const corner = parseBadgeCorner(patch.badgeCorner);
  if (corner !== null) next.badgeCorner = corner;
  if (typeof patch.badgeWidthPct === "number" && Number.isFinite(patch.badgeWidthPct)) next.badgeWidthPct = clampBadgeWidthPct(patch.badgeWidthPct);
  if (typeof patch.badgeOffsetXPct === "number" && Number.isFinite(patch.badgeOffsetXPct)) next.badgeOffsetXPct = clampBadgeOffsetPct(patch.badgeOffsetXPct);
  if (typeof patch.badgeOffsetYPct === "number" && Number.isFinite(patch.badgeOffsetYPct)) next.badgeOffsetYPct = clampBadgeOffsetPct(patch.badgeOffsetYPct);
  return next;
}

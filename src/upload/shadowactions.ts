// shadowactions.ts — selected-only shadow edits (the global popup's one control
// set). Every write goes through the shared validated uploadSettings history
// path; no global control copies a defaults value into a row (2026-10-21).
import { useCallback, useRef } from "react";
import {
  clampShadowGapPct, clampShadowWidthPct, effectiveSettings, type UploadSettings,
} from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { commitBatch } from "./selectedsettings";

type ShadowDimensions = Pick<UploadSettings, "shadowWidthPct" | "shadowGapPct">;

/** Mixed selection means Add; only an all-on selection means Remove. */
export function useShadowActions(ctx: UploadCtx): Slice<"toggleShadowSelected" | "setShadowSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleShadowSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const allOn = ids.every((id) => effectiveSettings(c.m.defaults, c.m.overrides[id] ?? {}).shadowEnabled);
    const on = !allOn;
    commitBatch(c, ids, on ? "Apply shadow" : "Remove shadow", (_id, prior) =>
      effectiveSettings(c.m.defaults, prior).shadowEnabled === on ? null : { ...prior, shadowEnabled: on });
  }, []);
  const setShadowSelected = useCallback((ids: string[], patch: Partial<ShadowDimensions>) => {
    const c = latest.current;
    if (ids.length === 0) return;
    const next = validatedDimensions(patch);
    if (Object.keys(next).length === 0) return;
    const label = "shadowWidthPct" in next ? "Set shadow width" : "Set shadow gap";
    commitBatch(c, ids, label, (_id, prior) => {
      const effective = effectiveSettings(c.m.defaults, prior);
      if (!effective.shadowEnabled) return null;
      const same = Object.entries(next).every(([key, value]) => effective[key as keyof ShadowDimensions] === value);
      return same ? null : { ...prior, ...next };
    });
  }, []);
  return { toggleShadowSelected, setShadowSelected };
}

function validatedDimensions(patch: Partial<ShadowDimensions>): Partial<ShadowDimensions> {
  const next: Partial<ShadowDimensions> = {};
  if (typeof patch.shadowWidthPct === "number" && Number.isFinite(patch.shadowWidthPct)) {
    next.shadowWidthPct = clampShadowWidthPct(patch.shadowWidthPct);
  }
  if (typeof patch.shadowGapPct === "number" && Number.isFinite(patch.shadowGapPct)) {
    next.shadowGapPct = clampShadowGapPct(patch.shadowGapPct);
  }
  return next;
}

// shadowactions.ts — selected-only shadow edits and the general bulk settings apply.
// Both write per-icon overrides through the same validated uploadSettings history path.
import { useCallback, useRef } from "react";
import { perIconFields } from "../lib/upload/asis";
import {
  clampShadowGapPct, clampShadowWidthPct, effectiveSettings, overridesEqual,
  type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";

type ShadowDimensions = Pick<UploadSettings, "shadowWidthPct" | "shadowGapPct">;
type MakeOverride = (id: string, prior: SettingsOverrides) => SettingsOverrides | null;

/** One selected-only edit, one discrete undo entry; skip rows that do not change. */
function commitBatch(c: UploadCtx, ids: string[], label: string, make: MakeOverride): number {
  const before: Record<string, SettingsOverrides | null> = {};
  const after: Record<string, SettingsOverrides | null> = {};
  const changed: string[] = [];
  for (const id of ids) {
    const prior = c.m.overrides[id] ?? {};
    const next = make(id, prior);
    if (next === null || overridesEqual(prior, next)) continue;
    before[id] = c.m.overrides[id] ?? null;
    after[id] = next;
    changed.push(id);
  }
  if (changed.length === 0) return 0;
  c.dispatch({ type: "overrides-patch", overrides: after });
  c.hist.push({ type: "uploadSettings", label, origin: "upload", ids: changed,
    before: { overrides: before }, after: { overrides: after } });
  c.say(`${label} — ${changed.length} icon${changed.length === 1 ? "" : "s"}`);
  return changed.length;
}

/** The normal bulk apply must not erase a separately pinned shadow. */
function shadowPins(prior: SettingsOverrides): SettingsOverrides {
  const out: SettingsOverrides = {};
  if (prior.shadowEnabled !== undefined) out.shadowEnabled = prior.shadowEnabled;
  if (prior.shadowWidthPct !== undefined) out.shadowWidthPct = prior.shadowWidthPct;
  if (prior.shadowGapPct !== undefined) out.shadowGapPct = prior.shadowGapPct;
  return out;
}

export function useOverrideApplyActions(ctx: UploadCtx): Slice<"applyDefaultsToSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const applyDefaultsToSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    commitBatch(c, ids, "Apply settings to selected", (_id, prior) => ({
      ...perIconFields(c.m.defaults), ...shadowPins(prior),
    }));
  }, []);
  return { applyDefaultsToSelected };
}

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

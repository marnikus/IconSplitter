// overrideactions.ts — the ONE place a row's settings may be pinned (2026-10-21):
// that icon's own Settings dialog. A field written here is a real local pin, so
// it drops the `applied` mark a global control may have set on that field; the
// row's "Reset to inherited" clears its LOCAL general pins only, leaves every
// decoration (and any applied value, and the stored defaults) alone.
import { useCallback, useRef } from "react";
import {
  appliedEqual, marksOf, withApplied, withoutLocalPins,
  type AppliedFields,
} from "../lib/upload/decorations";
import { overridesEqual, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { discreteSettingsChange } from "./settingsgestures";

/**
 * A local edit drops the applied mark of a field whose value really moved. The
 * dialog hands over the whole merged override, so presence alone would demote
 * fields the user never touched.
 */
export function marksAfterLocalEdit(
  marks: AppliedFields | null, before: SettingsOverrides | null, after: SettingsOverrides | null,
): AppliedFields | null {
  let next = marks;
  for (const field of Object.keys(marks ?? {}) as (keyof UploadSettings)[]) {
    if (!Object.is(before?.[field], after?.[field])) next = withApplied(next, field, false);
  }
  return next;
}

function nameOf(c: UploadCtx, id: string): string {
  return c.rows.find((r) => r.source.id === id)?.source.svgName ?? id;
}

/** One field pinned per icon — a gesture-coalesced undo entry per drag. */
export function useOverrideActions(ctx: UploadCtx): Slice<"setOverride"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setOverride = useCallback((id: string, patch: SettingsOverrides) => {
    const c = latest.current;
    const before = c.m.overrides[id] ?? null;
    const after = Object.keys(patch).length === 0 ? null : patch;
    const marksBefore = c.m.applied[id] ?? null;
    const marksAfter = marksAfterLocalEdit(marksBefore, before, after);
    if (overridesEqual(before ?? {}, after ?? {}) && appliedEqual(marksBefore, marksAfter)) return;
    c.dispatch({ type: "override", id, patch: after, applied: marksAfter });
    // Decoration toggles and committed numbers are discrete; other drags still coalesce.
    const push = discreteSettingsChange(before, after) ? c.hist.push : c.hist.pushGesture;
    push({
      type: "uploadSettings",
      label: `Override settings — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before }, applied: { [id]: marksBefore } },
      after: { overrides: { [id]: after }, applied: { [id]: marksAfter } },
    });
  }, []);
  return { setOverride };
}

/** Reset one icon to inherited — its LOCAL general pins only, one entry. */
export function useOverrideResetActions(ctx: UploadCtx): Slice<"resetOverride"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverride = useCallback((id: string) => {
    const c = latest.current;
    const before = c.m.overrides[id] ?? null;
    const marksBefore = c.m.applied[id] ?? null;
    const kept = withoutLocalPins(before ?? {}, marksBefore);
    if (Object.keys(kept).length === Object.keys(before ?? {}).length) {
      return c.say("This icon pins no local settings — it already inherits the rest");
    }
    const after = Object.keys(kept).length === 0 ? null : kept;
    const marksAfter = marksOf(kept, marksBefore);
    c.dispatch({ type: "override", id, patch: after, applied: marksAfter });
    c.hist.push({
      type: "uploadSettings",
      label: `Reset to inherited — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before }, applied: { [id]: marksBefore } },
      after: { overrides: { [id]: after }, applied: { [id]: marksAfter } },
    });
    c.say("Reset to inherited — the icon follows the global settings again; its decorations stay");
  }, []);
  return { resetOverride };
}

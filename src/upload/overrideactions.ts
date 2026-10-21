// overrideactions.ts — the ONE place a row's settings may be pinned (2026-10-21):
// that icon's own Settings dialog. A decoration flag written here is a real
// local pin, so it drops the `applied` mark the checked-set control may have
// set; the row's reset clears its pins and its marks together.
import { useCallback, useRef } from "react";
import {
  appliedEqual, DECORATION_FIELD, DECORATION_KEYS, isApplied, withApplied, type AppliedDecorations,
} from "../lib/upload/decorations";
import { overridesEqual, type SettingsOverrides } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { discreteSettingsChange } from "./settingsgestures";

/**
 * A local edit drops the applied mark of a decoration flag whose value really
 * moved. The dialog hands over the whole merged override, so presence alone
 * would demote decorations the user never touched.
 */
export function marksAfterLocalEdit(
  marks: AppliedDecorations | null, before: SettingsOverrides | null, after: SettingsOverrides | null,
): AppliedDecorations | null {
  let next = marks;
  for (const key of DECORATION_KEYS) {
    if (!isApplied(next, key)) continue;
    const field = DECORATION_FIELD[key];
    if (flagOf(before, field) !== flagOf(after, field)) next = withApplied(next, key, false);
  }
  return next;
}

function flagOf(patch: SettingsOverrides | null, field: (typeof DECORATION_FIELD)[keyof typeof DECORATION_FIELD]): boolean | null {
  const value = patch?.[field];
  return typeof value === "boolean" ? value : null;
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

/** Reset one icon to the defaults — its pins and its applied decorations, one entry. */
export function useOverrideResetActions(ctx: UploadCtx): Slice<"resetOverride"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverride = useCallback((id: string) => {
    const c = latest.current;
    const before = c.m.overrides[id] ?? null;
    const marksBefore = c.m.applied[id] ?? null;
    if (before === null && marksBefore === null) return c.say("This icon already inherits the defaults");
    c.dispatch({ type: "override", id, patch: null, applied: null });
    c.hist.push({
      type: "uploadSettings",
      label: `Reset to defaults — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before }, applied: { [id]: marksBefore } },
      after: { overrides: { [id]: null }, applied: { [id]: null } },
    });
    c.say("Reset to defaults — the icon inherits the global settings again");
  }, []);
  return { resetOverride };
}

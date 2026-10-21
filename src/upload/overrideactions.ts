// overrideactions.ts — the ONE place a row's settings may be pinned (2026-10-21):
// that icon's own Settings dialog. A field written here is a real local pin; the
// row's "Reset to inherited" deletes the WHOLE override map, so every parameter
// reads inherited again. The decorations a global control applied live in their
// own map and keep applying (archive/2026-10-21-decorations-are-not-overrides).
import { useCallback, useRef } from "react";
import { overridesEqual, type SettingsOverrides } from "../lib/upload/settings";
import type { Slice, UploadCtx } from "./actions";
import { discreteSettingsChange } from "./settingsgestures";

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
    if (overridesEqual(before ?? {}, after ?? {})) return;
    c.dispatch({ type: "override", id, patch: after });
    // Decoration toggles and committed numbers are discrete; other drags still coalesce.
    const push = discreteSettingsChange(before, after) ? c.hist.push : c.hist.pushGesture;
    push({
      type: "uploadSettings",
      label: `Override settings — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before } },
      after: { overrides: { [id]: null } },
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
    if (before === null) return c.say("This icon pins no local settings — it already inherits everything");
    c.dispatch({ type: "override", id, patch: null });
    c.hist.push({
      type: "uploadSettings",
      label: `Reset to inherited — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before } },
      after: { overrides: { [id]: null } },
    });
    c.say("Reset to inherited — the icon follows the global settings again; its decorations stay");
  }, []);
  return { resetOverride };
}

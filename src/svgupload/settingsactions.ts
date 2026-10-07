// settingsactions.ts — the undoable side of the upload settings (design §5).
// The rules live in lib/svgupload/settings (pure); THIS file is the one place
// they meet the global history, so a bulk apply and a bulk reset are each ONE
// entry the user can reverse from any tab (RULE 12). A failed payload is refused
// before anything is written, which is why the entry types stay conservative.

import { applyBulk, resetOverride, type UploadDefaults } from "../lib/svgupload/settings";
import { getAppState } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { getUploadSettings, setUploadSettings } from "./settingsstore";

/** Writes the patch to every selected icon as ONE undoable action. */
export function applyToSelection(
  hist: HistoryApi, ids: readonly string[], patch: Partial<UploadDefaults>, label: string,
): number {
  const { next, undo } = applyBulk(getUploadSettings(), ids, patch);
  if (undo.length === 0) return 0;
  setUploadSettings(next);
  hist.push({ type: "uploadSettings", label, origin: getAppState().tab, ids: [...ids], before: undo[0].before, after: undo[0].after });
  return ids.length;
}

/** Drops the per-icon overrides of the selection: they inherit again. */
export function resetSelection(hist: HistoryApi, ids: readonly string[]): number {
  const before = getUploadSettings();
  const next = ids.reduce((s, id) => resetOverride(s, id), before);
  if (ids.length === 0 || next === before) return 0;
  setUploadSettings(next);
  hist.push({
    type: "uploadSettings", origin: getAppState().tab, ids: [...ids], before, after: next,
    label: `Reset ${ids.length} icon${ids.length === 1 ? "" : "s"} to defaults`,
  });
  return ids.length;
}

// presetFlow.ts owns preset application: load by name + last-used autoload.

import type { Dispatch } from "react";
import { readLastName, readPreset, settingsOf, writeLastName, type BatchPreset } from "../../batch/presets";
import type { BatchAction } from "../../batch/reducer";
import type { Say } from "./scanFlow";

export function applyPreset(dispatch: Dispatch<BatchAction>, say: Say, preset: BatchPreset): void {
  dispatch({ type: "settings-set", settings: settingsOf(preset) });
  dispatch({ type: "folders-meta", sourceName: preset.sourceName, destName: preset.destName, useCustomDest: preset.useCustomDest });
  writeLastName(preset.name);
  say(`Preset “${preset.name}” loaded (re-pick folders to run it)`);
}

export function autoloadLastPreset(dispatch: Dispatch<BatchAction>, say: Say): void {
  const name = readLastName();
  const preset = name ? readPreset(name) : null;
  if (preset) applyPreset(dispatch, say, preset);
}

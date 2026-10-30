// Popup-local editing state; only explicit Load touches inherited defaults.
import { useState } from "react";
import { createExportPreset, renameExportPreset, removeExportPreset, type PresetChange, type ExportSettingsPreset } from "../lib/upload/settingspresets";
import { normalizeSettings, type UploadSettings } from "../lib/upload/settings";
import { loadExportPresets, saveExportPresets } from "./settingspresetstore";

interface PresetManagerState {
  presets: ExportSettingsPreset[];
  selected: string;
  name: string;
  removing: boolean;
  message: string;
}

function initialState(): PresetManagerState {
  return { presets: loadExportPresets(), selected: "", name: "", removing: false, message: "" };
}

export function useSettingsPresets(defaults: UploadSettings, onLoad: (settings: UploadSettings) => void) {
  const [state, setState] = useState(initialState);
  const patch = (change: Partial<PresetManagerState>) => setState((current) => ({ ...current, ...change }));
  const commit = (change: PresetChange, message: string) => {
    if (change.error !== null) { patch({ message: change.error }); return false; }
    if (!saveExportPresets(change.presets)) { patch({ message: "Unable to verify preset storage. Check browser storage and try again." }); return false; }
    patch({ presets: change.presets, selected: change.selected, name: change.selected, removing: false, message });
    return true;
  };
  return {
    state,
    select: (name: string) => patch({ selected: name, name, removing: false, message: "" }),
    setName: (name: string) => patch({ name, message: "" }),
    save: () => commit(createExportPreset(state.presets, state.name, defaults), "Export preset saved"),
    rename: () => commit(renameExportPreset(state.presets, state.selected, state.name), "Export preset renamed"),
    remove: () => commit(removeExportPreset(state.presets, state.selected), "Export preset removed"),
    askRemove: () => patch({ removing: true, message: "" }),
    cancelRemove: () => patch({ removing: false }),
    load: () => patch({ message: loadPreset(state, onLoad) }),
  };
}

/** Clone before handing off: later live edits cannot mutate the saved snapshot. */
function loadPreset(state: PresetManagerState, onLoad: (settings: UploadSettings) => void): string {
  const preset = state.presets.find((p) => p.name === state.selected);
  if (preset === undefined) return "Select an existing export preset first";
  onLoad(normalizeSettings(preset.settings));
  return "Export preset loaded into global defaults — local overrides and decoration selections kept";
}

export type SettingsPresetsManager = ReturnType<typeof useSettingsPresets>;

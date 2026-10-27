import { useState } from "react";
import type { StockPreferences } from "../lib/stockupload/preferences";
import { SettingsPresetControls, type PresetUiManager } from "../upload/UploadSettingsPresets";

type Props = { prefs: StockPreferences; update: (p: Partial<StockPreferences>) => void };
export default function StockPresets(p: Props) {
  const manager = useStockPresets(p);
  return <SettingsPresetControls manager={manager} prefix="stock-preset" label="Shutterstock presets" loadTitle="Load saved Shutterstock format choices" />;
}
function useStockPresets({ prefs, update }: Props): PresetUiManager {
  const [state, set] = useState({ selected: "", name: "", removing: false, message: "" });
  const patch = (p: Partial<typeof state>) => set(s => ({ ...s, ...p }));
  const commit = (rename: boolean) => {
    const name = state.name.trim(), others = prefs.presets.filter(p => !rename || p.name !== state.selected);
    if (!name || name.length > 60 || others.some(p => p.name.toLowerCase() === name.toLowerCase()) || (!rename && prefs.presets.length >= 50)) {
      patch({ message: "Choose a unique name of 1–60 characters (at most 50 presets)" }); return false;
    }
    const source = prefs.presets.find(p => p.name === state.selected);
    update({ presets: [...others, { name, formats: rename && source ? source.formats : { ...prefs.formats } }] });
    patch({ selected: name, name, message: rename ? "Preset renamed" : "Preset saved" }); return true;
  };
  return { state: { ...state, presets: prefs.presets },
    select: selected => patch({ selected, name: selected, removing: false, message: "" }), setName: name => patch({ name, message: "" }),
    save: () => commit(false), rename: () => commit(true), askRemove: () => patch({ removing: true }), cancelRemove: () => patch({ removing: false }),
    remove: () => { update({ presets: prefs.presets.filter(p => p.name !== state.selected) }); patch({ selected: "", removing: false, message: "Preset removed" }); return true; },
    load: () => { const preset = prefs.presets.find(p => p.name === state.selected); if (preset) { update({ formats: { ...preset.formats } }); patch({ message: "Preset loaded" }); } },
  };
}

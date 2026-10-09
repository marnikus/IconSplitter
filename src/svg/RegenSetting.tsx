// RegenSetting.tsx — the "Regenerate SVG from" window above the Generate SVG
// prompt (2026-10-09; moved here from the Export settings dialog). One choice
// decides how every Regenerate in this tab asks the model: the main prompt + the
// first image (the default), or the saved SVG prompt picked here + the icon's
// current SVG code + the same image. The preset list arrives as a prop, so a
// preset saved in the prompt window appears here at once (RULE 24); the stored
// choice is resolved by svg/regenstore, never by this window.

import { useState } from "react";
import { regenPlanOf, type RegenSetting } from "../lib/svgregen";
import type { PromptPreset } from "../lib/promptpresets";
import { loadRegenSetting, saveRegenSetting } from "./regenstore";

export default function RegenSettingWindow({ presets }: { presets: PromptPreset[] }) {
  const [setting, setSetting] = useState<RegenSetting>(loadRegenSetting);
  const write = (next: RegenSetting) => {
    setSetting(next);
    saveRegenSetting(next);
  };
  return (
    <div className="svg-regen" data-testid="svg-regen">
      <label className="svg-field">
        <span className="svg-label">Regenerate SVG from</span>
        <select className="svg-input" data-testid="svg-regen-mode" aria-label="Regenerate SVG from"
          value={setting.mode}
          onChange={(e) => write({ ...setting, mode: e.target.value === "current-svg" ? "current-svg" : "main" })}>
          <option value="main">Main prompt + first image</option>
          <option value="current-svg">Regenerate from current SVG</option>
        </select>
      </label>
      {setting.mode === "current-svg" && <PresetPick setting={setting} presets={presets} onChange={write} />}
      <small className="up-hint" data-testid="svg-regen-note">{noteOf(setting, presets)}</small>
    </div>
  );
}

/** The saved prompt drop-down: the SVG presets by name, nothing guessed. */
function PresetPick({ setting, presets, onChange }: {
  setting: RegenSetting; presets: PromptPreset[]; onChange: (next: RegenSetting) => void;
}) {
  return (
    <select className="svg-input" data-testid="svg-regen-preset" aria-label="Saved prompt for regeneration"
      value={setting.presetName} onChange={(e) => onChange({ ...setting, presetName: e.target.value })}>
      <option value="">— choose a saved prompt —</option>
      {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
  );
}

/** What the choice will really do, or why it cannot yet. */
function noteOf(setting: RegenSetting, presets: PromptPreset[]): string {
  if (setting.mode === "main") return "each Regenerate sends the full main prompt with its first image alone";
  const plan = regenPlanOf(setting, presets);
  if (plan.ok) return `each Regenerate sends “${setting.presetName}”, the icon's current SVG code and the same first image — one icon per request`;
  if (presets.length === 0) return "No saved prompts yet — save one in the prompt window above, then pick it here";
  return setting.presetName === "" ? "pick a saved prompt above — each Regenerate needs one" : plan.problem;
}

// UploadRegenSetting.tsx — the "Regenerate SVG from" row of the export settings
// dialog (2026-10-09). Global only: one choice decides how every Regenerate in
// the Generate SVG tab asks the model — the main prompt + the first image (the
// default), or the saved prompt picked here + the icon's current SVG code + the
// same image. Written at the moment of the change (RULE 24); the stored value
// is resolved by svg/regenstore, never by this row.

import { useState } from "react";
import { regenPlanOf, type RegenSetting } from "../lib/svgregen";
import type { PromptPreset } from "../lib/upload/promptpresets";
import { loadRegenSetting, saveRegenSetting } from "../svg/regenstore";
import { loadPresets } from "./promptstore";

export default function UploadRegenSetting() {
  const [setting, setSetting] = useState<RegenSetting>(loadRegenSetting);
  // Presets change only in the prompt panel, which sits behind this dialog.
  const [presets] = useState<PromptPreset[]>(loadPresets);
  const write = (next: RegenSetting) => {
    setSetting(next);
    saveRegenSetting(next);
  };
  return (
    <div className="svg-field up-set-field" data-testid="upload-regen">
      <span className="svg-label">Regenerate SVG from</span>
      <select className="svg-input" data-testid="upload-regen-mode" aria-label="Regenerate SVG from"
        value={setting.mode}
        onChange={(e) => write({ ...setting, mode: e.target.value === "current-svg" ? "current-svg" : "main" })}>
        <option value="main">Main prompt + first image</option>
        <option value="current-svg">Regenerate from current SVG</option>
      </select>
      {setting.mode === "current-svg" && <PresetPick setting={setting} presets={presets} onChange={write} />}
      <small className="up-hint" data-testid="upload-regen-note">{noteOf(setting, presets)}</small>
    </div>
  );
}

/** The saved prompt drop-down: the presets by name, nothing guessed. */
function PresetPick({ setting, presets, onChange }: {
  setting: RegenSetting; presets: PromptPreset[]; onChange: (next: RegenSetting) => void;
}) {
  return (
    <select className="svg-input" data-testid="upload-regen-preset" aria-label="Saved prompt for regeneration"
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
  if (presets.length === 0) return "No saved prompts yet — save one in the metadata prompt panel, then pick it here";
  return setting.presetName === "" ? "pick a saved prompt above — each Regenerate needs one" : plan.problem;
}

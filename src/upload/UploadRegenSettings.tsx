// UploadRegenSettings.tsx — the "Regenerate from current SVG" section of the
// Export settings dialog (design 2026-10-09, D2/D3). The dialog merely EDITS
// the option: the store is svg/regenstore, the Generate SVG tab reads it when a
// run starts, and the preset names come from the saved prompt presets. Global
// only — a per-icon override is not offered, and the hint says so.

import { useState } from "react";
import type { RegenSettings } from "../lib/regensvg";
import { loadRegenSettings, saveRegenSettings } from "../svg/regenstore";
import { loadPresets } from "./promptstore";

export default function UploadRegenSettings() {
  const [settings, setSettings] = useState<RegenSettings>(() => loadRegenSettings());
  const [presets] = useState<string[]>(() => loadPresets().map((p) => p.name));
  const update = (next: RegenSettings): void => {
    setSettings(next);
    saveRegenSettings(next);
  };
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Regenerate from current SVG</span>
      <label className="up-regen-toggle">
        <input type="checkbox" data-testid="regen-from-svg" checked={settings.enabled}
          onChange={(e) => update({ ...settings, enabled: e.target.checked })} />
        <span>send the icon's last SVG code with the prompt below, instead of the main prompt alone</span>
      </label>
      <select className="svg-input" data-testid="regen-preset" aria-label="Prompt preset used with the current SVG"
        disabled={presets.length === 0} value={settings.preset}
        onChange={(e) => update({ ...settings, preset: e.target.value })}>
        <option value="">— choose a saved prompt preset —</option>
        {presets.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {presets.length === 0 && (
        <small className="up-hint" data-testid="regen-preset-note">
          no saved prompt presets yet — save one in the prompt panel; until then re-generations use the main prompt
        </small>
      )}
      <small className="up-hint">applies to every re-generation in Generate SVG · one icon per request · the same reference image travels with it</small>
    </div>
  );
}

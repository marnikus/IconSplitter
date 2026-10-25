import type { UploadSettings } from "../lib/upload/settings";
import { useSettingsPresets, type SettingsPresetsManager } from "./settingspresetsmodel";

export default function UploadSettingsPresets({ defaults, onLoad }: { defaults: UploadSettings; onLoad: (settings: UploadSettings) => void }) {
  const manager = useSettingsPresets(defaults, onLoad);
  return <fieldset className="up-set-field rounded-md border border-white/10 p-3 my-3 space-y-2" data-testid="upload-settings-presets">
    <legend className="svg-label">Named export presets</legend>
    <PresetPicker manager={manager} />
    <PresetEditor manager={manager} />
    {manager.state.removing && <RemoveConfirmation manager={manager} />}
    <small className="up-hint">Save global defaults for reuse. Load changes inherited settings, not local pins or checked decoration choices. Use Apply as local to freeze a batch.</small>
    <p role="status" aria-live="polite" data-testid="upload-settings-preset-status">{manager.state.message}</p>
  </fieldset>;
}

function PresetPicker({ manager: m }: { manager: SettingsPresetsManager }) {
  return <div className="up-bg-row">
    <label className="svg-label" htmlFor="upload-settings-preset-select">Saved preset</label>
    <select id="upload-settings-preset-select" className="svg-input min-w-0 flex-1" data-testid="upload-settings-preset-select"
      value={m.state.selected} onChange={(e) => m.select(e.target.value)}>
      <option value="">Choose a preset…</option>
      {m.state.presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-load" disabled={!m.state.selected} onClick={m.load}>Load</button>
  </div>;
}

function PresetEditor({ manager: m }: { manager: SettingsPresetsManager }) {
  return <div className="up-bg-row">
    <label className="svg-label" htmlFor="upload-settings-preset-name">Preset name</label>
    <input id="upload-settings-preset-name" className="svg-input min-w-0 flex-1" data-testid="upload-settings-preset-name"
      maxLength={60} value={m.state.name} onChange={(e) => m.setName(e.target.value)} />
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-save" onClick={m.save}>Save current</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-rename" disabled={!m.state.selected} onClick={m.rename}>Rename</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove" disabled={!m.state.selected} onClick={m.askRemove}>Remove</button>
  </div>;
}

function RemoveConfirmation({ manager: m }: { manager: SettingsPresetsManager }) {
  return <div className="up-bg-row" role="group" aria-label="Confirm preset removal">
    <span>Remove preset “{m.state.selected}”? Current export settings will stay unchanged.</span>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove-confirm" onClick={m.remove}>Remove preset</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove-cancel" onClick={m.cancelRemove}>Cancel</button>
  </div>;
}

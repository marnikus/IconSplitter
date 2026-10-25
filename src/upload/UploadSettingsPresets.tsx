import { useState } from "react";
import type { UploadSettings } from "../lib/upload/settings";
import { useSettingsPresets, type SettingsPresetsManager } from "./settingspresetsmodel";

type EditMode = "save" | "rename" | null;
interface ToolbarProps { manager: SettingsPresetsManager; onEdit: (mode: EditMode) => void }

export default function UploadSettingsPresets({ defaults, onLoad }: { defaults: UploadSettings; onLoad: (settings: UploadSettings) => void }) {
  const manager = useSettingsPresets(defaults, onLoad);
  const [editing, setEditing] = useState<EditMode>(null);
  const edit = (mode: EditMode) => {
    manager.setName(mode === "rename" ? manager.state.selected : "");
    manager.cancelRemove();
    setEditing(mode);
  };
  return <div className="my-2 space-y-1" data-testid="upload-settings-presets">
    <PresetToolbar manager={manager} onEdit={edit} />
    {editing !== null && <PresetNameEditor manager={manager} mode={editing} onClose={() => setEditing(null)} />}
    {manager.state.removing && <RemoveConfirmation manager={manager} />}
    <span className="block up-hint" role="status" aria-live="polite" data-testid="upload-settings-preset-status">{manager.state.message}</span>
  </div>;
}

function PresetToolbar({ manager: m, onEdit }: ToolbarProps) {
  return <div className="up-bg-row" role="group" aria-label="Export presets">
    <label className="svg-label" htmlFor="upload-settings-preset-select">Preset</label>
    <select id="upload-settings-preset-select" className="svg-input min-w-0 flex-1 max-w-xs" data-testid="upload-settings-preset-select"
      value={m.state.selected} onChange={(e) => { onEdit(null); m.select(e.target.value); }}>
      <option value="">Choose a preset…</option>
      {m.state.presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-load" disabled={!m.state.selected} onClick={m.load}
      title="Load global defaults; local overrides and decoration selections stay unchanged">Load</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-save-open" onClick={() => onEdit("save")}>Save as…</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-rename" disabled={!m.state.selected} onClick={() => onEdit("rename")}>Rename</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove" disabled={!m.state.selected}
      onClick={() => { onEdit(null); m.askRemove(); }}>Remove</button>
  </div>;
}

function PresetNameEditor({ manager: m, mode, onClose }: { manager: SettingsPresetsManager; mode: Exclude<EditMode, null>; onClose: () => void }) {
  const rename = mode === "rename";
  return <form className="up-bg-row" data-testid="upload-settings-preset-form"
    onSubmit={(e) => { e.preventDefault(); if (rename ? m.rename() : m.save()) onClose(); }}>
    <label className="sr-only" htmlFor="upload-settings-preset-name">Preset name</label>
    <input id="upload-settings-preset-name" className="svg-input min-w-0 flex-1 max-w-xs" data-testid="upload-settings-preset-name"
      autoFocus maxLength={60} placeholder={rename ? "New preset name" : "Name for current settings"} value={m.state.name}
      onChange={(e) => m.setName(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }} />
    <button type="submit" className="svg-btn tiny" data-testid={rename ? "upload-settings-preset-rename-confirm" : "upload-settings-preset-save"}>{rename ? "Rename" : "Save"}</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-edit-cancel" onClick={onClose}>Cancel</button>
  </form>;
}

function RemoveConfirmation({ manager: m }: { manager: SettingsPresetsManager }) {
  return <div className="up-bg-row" role="group" aria-label="Confirm preset removal">
    <span>Remove “{m.state.selected}”? Current settings stay unchanged.</span>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove-confirm" onClick={m.remove}>Remove preset</button>
    <button type="button" className="svg-btn tiny" data-testid="upload-settings-preset-remove-cancel" onClick={m.cancelRemove}>Cancel</button>
  </div>;
}

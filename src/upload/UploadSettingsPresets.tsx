import { useState } from "react";
import type { UploadSettings } from "../lib/upload/settings";
import { useSettingsPresets, type SettingsPresetsManager } from "./settingspresetsmodel";

export type PresetUiManager = Omit<SettingsPresetsManager, "state"> & { state: Omit<SettingsPresetsManager["state"], "presets"> & { presets: readonly { name: string }[] } };
interface SharedProps { manager: PresetUiManager; prefix?: string; label?: string; loadTitle?: string }
type EditMode = "save" | "rename" | null;
interface ToolbarProps extends SharedProps { onEdit: (mode: EditMode) => void }

export default function UploadSettingsPresets({ defaults, onLoad }: { defaults: UploadSettings; onLoad: (settings: UploadSettings) => void }) {
  const manager = useSettingsPresets(defaults, onLoad);
  return <SettingsPresetControls manager={manager} />;
}

export function SettingsPresetControls({ manager, prefix = "upload-settings-preset", label = "Export presets", loadTitle = "Load global defaults; local overrides and decoration selections stay unchanged" }: SharedProps) {
  const [editing, setEditing] = useState<EditMode>(null);
  const edit = (mode: EditMode) => {
    manager.setName(mode === "rename" ? manager.state.selected : "");
    manager.cancelRemove();
    setEditing(mode);
  };
  return <div className="my-2 space-y-1" data-testid={`${prefix}s`}>
    <PresetToolbar manager={manager} prefix={prefix} label={label} loadTitle={loadTitle} onEdit={edit} />
    {editing !== null && <PresetNameEditor manager={manager} prefix={prefix} mode={editing} onClose={() => setEditing(null)} />}
    {manager.state.removing && <RemoveConfirmation manager={manager} prefix={prefix} />}
    <span className="block up-hint" role="status" aria-live="polite" data-testid={`${prefix}-status`}>{manager.state.message}</span>
  </div>;
}

function PresetToolbar({ manager: m, prefix, label, loadTitle, onEdit }: ToolbarProps) {
  return <div className="up-bg-row" role="group" aria-label={label}>
    <label className="svg-label" htmlFor={`${prefix}-select`}>Preset</label>
    <select id={`${prefix}-select`} className="svg-input min-w-0 flex-1 max-w-xs" data-testid={`${prefix}-select`}
      value={m.state.selected} onChange={(e) => { onEdit(null); m.select(e.target.value); }}>
      <option value="">Choose a preset…</option>
      {m.state.presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-load`} disabled={!m.state.selected} onClick={m.load}
      title={loadTitle}>Load</button>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-save-open`} onClick={() => onEdit("save")}>Save as…</button>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-rename`} disabled={!m.state.selected} onClick={() => onEdit("rename")}>Rename</button>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-remove`} disabled={!m.state.selected}
      onClick={() => { onEdit(null); m.askRemove(); }}>Remove</button>
  </div>;
}

function PresetNameEditor({ manager: m, prefix, mode, onClose }: SharedProps & { mode: Exclude<EditMode, null>; onClose: () => void }) {
  const rename = mode === "rename";
  return <form className="up-bg-row" data-testid={`${prefix}-form`}
    onSubmit={(e) => { e.preventDefault(); if (rename ? m.rename() : m.save()) onClose(); }}>
    <label className="sr-only" htmlFor={`${prefix}-name`}>Preset name</label>
    <input id={`${prefix}-name`} className="svg-input min-w-0 flex-1 max-w-xs" data-testid={`${prefix}-name`}
      autoFocus maxLength={60} placeholder={rename ? "New preset name" : "Name for current settings"} value={m.state.name}
      onChange={(e) => m.setName(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }} />
    <button type="submit" className="svg-btn tiny" data-testid={rename ? `${prefix}-rename-confirm` : `${prefix}-save`}>{rename ? "Rename" : "Save"}</button>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-edit-cancel`} onClick={onClose}>Cancel</button>
  </form>;
}

function RemoveConfirmation({ manager: m, prefix }: SharedProps) {
  return <div className="up-bg-row" role="group" aria-label="Confirm preset removal">
    <span>Remove “{m.state.selected}”? Current settings stay unchanged.</span>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-remove-confirm`} onClick={m.remove}>Remove preset</button>
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-remove-cancel`} onClick={m.cancelRemove}>Cancel</button>
  </div>;
}

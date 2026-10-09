// PromptPresetBar.tsx — the preset controls under a prompt window (2026-10-09):
// the saved list with Quick load and Delete on the picked entry, and Save as with
// its name field. Shared by the metadata prompt and the Generate SVG prompt; the
// test-id prefix is the window's (`<id>-preset-list`, `<id>-preset-save`, …).
// No rule lives here — every gesture goes straight back to the window's callbacks.

import { useState } from "react";
import type { PromptPreset } from "../lib/promptpresets";
import type { PromptWindowProps } from "./PromptWindow";

type BarProps = Pick<PromptWindowProps,
  "testId" | "presets" | "picked" | "onPick" | "onQuickLoad" | "onDelete" | "onSaveAs">;

export default function PromptPresetBar(p: BarProps) {
  return (
    <>
      <PresetRow p={p} />
      <SaveRow p={p} />
    </>
  );
}

/** The saved list and the two gestures that act on the picked entry. */
function PresetRow({ p }: { p: BarProps }) {
  const none = p.picked === "";
  return (
    <div className="up-preset-row">
      <label className="svg-field">
        <span className="svg-label">Prompt presets</span>
        <select className="svg-input" data-testid={`${p.testId}-preset-list`} aria-label="Saved prompt presets"
          value={p.picked} onChange={(e) => p.onPick(e.target.value)}>
          <option value="">Pick a saved prompt ({p.presets.length} saved)</option>
          {p.presets.map((preset: PromptPreset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
        </select>
      </label>
      <button type="button" className="svg-btn" data-testid={`${p.testId}-preset-quick-load`} disabled={none}
        onClick={p.onQuickLoad}>Quick load</button>
      <button type="button" className="svg-btn" data-testid={`${p.testId}-preset-delete`} disabled={none}
        onClick={p.onDelete}>Delete</button>
    </div>
  );
}

/** Save as: the name field and its button, one row, nothing else. */
function SaveRow({ p }: { p: BarProps }) {
  const [name, setName] = useState("");
  const save = () => p.onSaveAs(name);
  return (
    <div className="up-preset-row save">
      <label className="svg-field">
        <span className="svg-label">Save the editor as</span>
        <input className="svg-input" data-testid={`${p.testId}-preset-name`} aria-label="Prompt preset name"
          placeholder="Preset name" spellCheck={false} value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      </label>
      <button type="button" className="svg-btn" data-testid={`${p.testId}-preset-save`} onClick={save}>Save as</button>
      <span className="up-preset-hint">saved presets are names you can re-use, never a second prompt</span>
    </div>
  );
}

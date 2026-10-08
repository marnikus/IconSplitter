// UploadPromptPanel.tsx — the metadata prompt, in its own large panel (design
// §2.8, the reference's "METADATA PROMPT · SAVED LOCALLY"): the editable text,
// the one-button reset to the documented default, and the preset row underneath
// — the saved list, Quick load, Delete, and Save as with a name field.
// No rule lives here: the text is the model's, the presets are the store's, and
// every gesture goes straight back to the hook.

import { useState } from "react";
import { isDefaultPrompt, type PromptPreset } from "../lib/upload/promptpresets";

export interface UploadPromptPanelProps {
  prompt: string;
  presets: PromptPreset[];
  picked: string;
  onPrompt: (text: string) => void;
  onReset: () => void;
  onPick: (name: string) => void;
  onQuickLoad: () => void;
  onDelete: () => void;
  onSaveAs: (name: string) => void;
}

export default function UploadPromptPanel(p: UploadPromptPanelProps) {
  return (
    <section className="up-prompt-panel" data-testid="upload-prompt-panel" aria-label="Metadata prompt">
      <Head p={p} />
      <Editor p={p} />
      <PresetRow p={p} />
      <SaveRow p={p} />
      <p className="svg-note" data-testid="upload-prompt-note">
        Stored on this device only; it travels nowhere except inside the one request you confirm.
        The metadata validator always enforces the rules the default prompt states, so an edited
        prompt that asks for something else produces answers that are refused — the policy never
        relaxes.
      </p>
    </section>
  );
}

/** The panel label and the reset link — the same wording the SVG tab uses. */
function Head({ p }: { p: UploadPromptPanelProps }) {
  const kind = isDefaultPrompt(p.prompt) ? "default" : "custom";
  return (
    <div className="svg-field-label">
      <span data-testid="upload-prompt-copy">Metadata prompt · saved locally · {kind}</span>
      <button type="button" className="svg-link" data-testid="upload-prompt-reset" onClick={p.onReset}>
        Reset default
      </button>
    </div>
  );
}

function Editor({ p }: { p: UploadPromptPanelProps }) {
  return (
    <textarea className="svg-prompt up-prompt-editor" data-testid="upload-prompt"
      aria-label="The metadata prompt" spellCheck={false}
      value={p.prompt} onChange={(e) => p.onPrompt(e.target.value)} />
  );
}

/** The saved list and the two gestures that act on the picked entry. */
function PresetRow({ p }: { p: UploadPromptPanelProps }) {
  return (
    <div className="up-preset-row">
      <label className="svg-field">
        <span className="svg-label">Prompt presets</span>
        <select className="svg-input" data-testid="upload-preset-list" aria-label="Saved prompt presets"
          value={p.picked} onChange={(e) => p.onPick(e.target.value)}>
          <option value="">Pick a saved prompt ({p.presets.length} saved)</option>
          {p.presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
        </select>
      </label>
      <button type="button" className="svg-btn" data-testid="upload-preset-quick-load" disabled={p.picked === ""}
        onClick={p.onQuickLoad}>Quick load</button>
      <button type="button" className="svg-btn" data-testid="upload-preset-delete" disabled={p.picked === ""}
        onClick={p.onDelete}>Delete</button>
    </div>
  );
}

/** Save as: the name field and its button, one row, nothing else. */
function SaveRow({ p }: { p: UploadPromptPanelProps }) {
  const [name, setName] = useState("");
  const save = () => p.onSaveAs(name);
  return (
    <div className="up-preset-row save">
      <label className="svg-field">
        <span className="svg-label">Save the editor as</span>
        <input className="svg-input" data-testid="upload-preset-name" aria-label="Prompt preset name"
          placeholder="Preset name" spellCheck={false} value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      </label>
      <button type="button" className="svg-btn" data-testid="upload-preset-save" onClick={save}>Save as</button>
      <span className="up-preset-hint">saved presets are names you can re-use, never a second prompt</span>
    </div>
  );
}

// PromptWindow.tsx — one prompt window (2026-10-09): the label with the saved /
// default state and the reset link, the editable text, and the shared preset bar.
// The metadata prompt and the Generate SVG prompt both render it, so the window
// looks and behaves the same in both tabs. `testId` is the prefix of every
// data-testid inside (`upload`, `svg`), so existing handles keep working.

import type { PromptPreset } from "../lib/promptpresets";
import PromptPresetBar from "./PromptPresetBar";

export interface PromptWindowProps {
  testId: string;
  label: string;
  text: string;
  isDefault: boolean;
  /** Extra class for the editor (the metadata panel sizes it taller). */
  editorClass?: string;
  presets: PromptPreset[];
  picked: string;
  onText: (text: string) => void;
  onReset: () => void;
  onPick: (name: string) => void;
  onQuickLoad: () => void;
  onDelete: () => void;
  onSaveAs: (name: string) => void;
}

export default function PromptWindow(p: PromptWindowProps) {
  return (
    <div className="prompt-window" data-testid={`${p.testId}-prompt-window`}>
      <div className="svg-field-label">
        <span data-testid={`${p.testId}-prompt-copy`}>{p.label} · saved locally · {p.isDefault ? "default" : "custom"}</span>
        <button type="button" className="svg-link" data-testid={`${p.testId}-prompt-reset`} onClick={p.onReset}>
          Reset default
        </button>
      </div>
      <textarea className={`svg-prompt ${p.editorClass ?? ""}`} data-testid={`${p.testId}-prompt`}
        aria-label={p.label} spellCheck={false} value={p.text} onChange={(e) => p.onText(e.target.value)} />
      <PromptPresetBar {...p} />
    </div>
  );
}

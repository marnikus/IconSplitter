// UploadPromptPanel.tsx — the metadata prompt, in its own large panel (design
// §2.8, the reference's "METADATA PROMPT · SAVED LOCALLY"). The window itself —
// text, reset, and the shared preset bar — is ui/PromptWindow, the same one the
// Generate SVG tab uses. Only the panel frame and the stored-locally note live here.

import { isDefaultPrompt, type PromptPreset } from "../lib/upload/promptpresets";
import PromptWindow from "../ui/PromptWindow";

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
      <PromptWindow testId="upload" label="Metadata prompt" editorClass="up-prompt-editor"
        text={p.prompt} isDefault={isDefaultPrompt(p.prompt)} presets={p.presets} picked={p.picked}
        onText={p.onPrompt} onReset={p.onReset} onPick={p.onPick} onQuickLoad={p.onQuickLoad}
        onDelete={p.onDelete} onSaveAs={p.onSaveAs} />
      <p className="svg-note" data-testid="upload-prompt-note">
        Stored on this device only; it travels nowhere except inside the one request you confirm.
        The metadata validator always enforces the rules the default prompt states, so an edited
        prompt that asks for something else produces answers that are refused — the policy never
        relaxes.
      </p>
    </section>
  );
}

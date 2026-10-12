// SvgPromptZone.tsx — the prompt window for Generate SVG (2026-10-09 revised):
// first generation uses the main current loaded prompt shown here.
// Regeneration prompt is now chosen per-batch in the confirmation popup
// (2026-10-09), so the global "Regenerate SVG from" window is no longer in
// the main toolbar — it stays as a module for the front-placement fallback.

import { isDefaultPrompt } from "../lib/svgprompt";
import PromptWindow, { type PromptWindowProps } from "../ui/PromptWindow";
import type { SvgGenApi } from "./useSvgGen";

export default function SvgPromptZone({ win }: { win: PromptWindowProps }) {
  return (
    <div className="svg-prompt-zone">
      <PromptWindow {...win} />
    </div>
  );
}

/** The prompt window's props, wired from the Generate SVG api in one place. */
export function svgPromptWindowOf(g: SvgGenApi): PromptWindowProps {
  return {
    testId: "svg", label: "Generation prompt", text: g.prompt, isDefault: isDefaultPrompt(g.prompt),
    presets: g.presets, picked: g.presetPick,
    onText: g.setPrompt, onReset: g.resetPrompt, onPick: g.pickPreset, onQuickLoad: g.quickLoadPreset,
    onDelete: g.deletePreset, onSaveAs: g.savePresetAs,
  };
}

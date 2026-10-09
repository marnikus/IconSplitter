// SvgPromptZone.tsx — the left block of the Generate SVG control row (2026-10-09):
// the "Regenerate SVG from" window, then directly beneath it the main prompt
// window with its presets. The regen window sits above the prompt it refers to.

import { isDefaultPrompt } from "../lib/svgprompt";
import PromptWindow, { type PromptWindowProps } from "../ui/PromptWindow";
import RegenSettingWindow from "./RegenSetting";
import type { SvgGenApi } from "./useSvgGen";

export default function SvgPromptZone({ win }: { win: PromptWindowProps }) {
  return (
    <div className="svg-prompt-zone">
      <RegenSettingWindow presets={win.presets} />
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

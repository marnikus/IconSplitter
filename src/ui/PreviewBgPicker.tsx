// PreviewBgPicker.tsx — the PREVIEW BG control (2026-11-06, shared): the
// background presets plus one custom colour = ONE decision, shown in Generate
// SVG's and SVG to upload's bulk bars and in the SVG edit mode's top bar.
// Handles `<prefix>-bg`, `<prefix>-bg-<preset>`, `<prefix>-bg-custom`,
// `<prefix>-bg-value`. Preview only: saved SVG files are never changed.

import { BG_PRESETS, backgroundLabel, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";

export default function PreviewBgPicker({ prefix, bg, onBg }: { prefix: string; bg: PreviewBackground; onBg: (bg: PreviewBackground) => void }) {
  return (
    <div className="svg-bg" data-testid={`${prefix}-bg`}>
      <label htmlFor={`${prefix}-bg-custom`}>PREVIEW BG</label>
      {BG_PRESETS.map((preset) => (
        <button key={preset.id} type="button" className={`svg-swatch${bg.preset === preset.id ? " on" : ""}`}
          data-testid={`${prefix}-bg-${preset.id}`} title={`Preview background: ${preset.label}`}
          aria-label={`Preview background ${preset.label}`} aria-pressed={bg.preset === preset.id}
          style={{ background: preset.color }} onClick={() => onBg(selectPreset(bg, preset.id))} />
      ))}
      <input id={`${prefix}-bg-custom`} data-testid={`${prefix}-bg-custom`} type="color" value={bg.custom}
        aria-label="Custom preview background" onChange={(e) => onBg(selectCustom(bg, e.target.value))} />
      <output className="svg-bg-value" data-testid={`${prefix}-bg-value`} htmlFor={`${prefix}-bg-custom`}
        title="Preview only — saved SVG files and their code are never changed">{backgroundLabel(bg)}</output>
    </div>
  );
}

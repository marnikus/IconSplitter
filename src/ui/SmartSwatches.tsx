// SmartSwatches.tsx — the colour suggestions shared by SVG builder's quick
// colour menu and the edit mode's colour bar (2026-11-27): six colours close to
// the current one (lib/svgBuilder/swatches) and a "custom" dot that opens the
// browser's colour picker. The caller owns the colour and the look.

import { smartSwatches } from "../lib/svgBuilder/swatches";

export interface SmartSwatchesProps {
  /** The colour the suggestions are built around, `#RRGGBB`. */
  current: string;
  /** `gesture` is true while the browser's picker is being dragged. */
  onPick: (hex: string, gesture: boolean) => void;
  /** Test-id prefix: `<prefix>-swatch-RRGGBB`, `<prefix>-custom`. */
  prefix: string;
  dotClass: string;
  customClass: string;
}

export default function SmartSwatches({ current, onPick, prefix, dotClass, customClass }: SmartSwatchesProps) {
  return (
    <>
      {smartSwatches(current).map((c) => (
        <button type="button" key={c} className={dotClass} data-testid={`${prefix}-swatch-${c.slice(1)}`}
          style={{ background: c }} title={c} aria-label={`Use ${c}`} onClick={() => onPick(c, false)} />
      ))}
      <label className={`${dotClass} ${customClass}`} title="Custom color">
        <input type="color" data-testid={`${prefix}-custom`} aria-label="Custom color" value={current.toLowerCase()}
          onChange={(e) => onPick(e.target.value.toUpperCase(), true)} />
      </label>
    </>
  );
}

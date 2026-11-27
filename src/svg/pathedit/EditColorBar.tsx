// EditColorBar.tsx — the edit mode's colours in the top bar (2026-11-27): the
// current colour over the second one with a swap between them (X, as in
// Illustrator), a hex field, colours close to the current one (the same
// suggestions as SVG builder's quick colour menu), the saved swatches with
// "+" to save the current colour, a screen picker where the browser has one,
// and "fill selected". The Fill tool (K) paints with the current colour.

import { useEffect, useState } from "react";
import { dropSwatch, saveSwatch, swapColors, withFg } from "../../lib/pathedit/palette";
import { cleanHex } from "../../lib/svgBuilder/swatches";
import SmartSwatches from "../../ui/SmartSwatches";
import { changePalette, usePalette } from "./editcolors";

type ScreenPicker = new () => { open: () => Promise<{ sRGBHex: string }> };
const screenPicker = (): ScreenPicker | undefined => (window as unknown as { EyeDropper?: ScreenPicker }).EyeDropper;

const setFg = (color: string) => changePalette((p) => withFg(p, color));

/** Picks any pixel on the screen (the AI source image too) into the current colour. */
async function pickFromScreen(): Promise<void> {
  const Picker = screenPicker();
  if (Picker === undefined) return;
  try {
    setFg((await new Picker().open()).sRGBHex);
  } catch {
    // Esc: nothing picked
  }
}

/** The two colours, overlapping as in Illustrator: the current one on top (a click opens the picker), the second behind (a click swaps). */
function ColorPair({ testid, fg, bg }: { testid: string; fg: string; bg: string }) {
  return (
    <span className="svg-edit-pair">
      <button type="button" className="svg-edit-chip back" data-testid={`${testid}-bg`} style={{ background: bg }}
        title={`Second colour ${bg} — click to swap (X)`} aria-label="Swap the two colours" onClick={() => changePalette(swapColors)} />
      <label className="svg-edit-chip front" style={{ background: fg }} title={`Current colour ${fg} — click to choose`}>
        <input type="color" data-testid={`${testid}-fg`} aria-label="Current colour" value={fg.toLowerCase()} onChange={(e) => setFg(e.target.value)} />
      </label>
      <button type="button" className="svg-edit-swap" data-testid={`${testid}-swap`} title="Swap the two colours (X)" aria-label="Swap the two colours"
        onClick={() => changePalette(swapColors)}>⇄</button>
    </span>
  );
}

function HexField({ testid, fg }: { testid: string; fg: string }) {
  const [hex, setHex] = useState(fg);
  useEffect(() => { setHex(fg); }, [fg]);
  const commit = () => { const clean = cleanHex(hex); if (clean === null) setHex(fg); else setFg(clean); };
  return (
    <input className="svg-input svg-edit-hex" data-testid={`${testid}-hex`} value={hex} maxLength={7} aria-label="Hex colour"
      onChange={(e) => setHex(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
  );
}

/** The saved swatches: click uses one, right-click (or Alt+click) removes it; "+" saves the current colour. */
function Saved({ testid, fg, swatches }: { testid: string; fg: string; swatches: readonly string[] }) {
  const drop = (c: string) => changePalette((p) => dropSwatch(p, c));
  return (
    <span className="svg-edit-swatches" data-testid={`${testid}-saved`}>
      {swatches.map((c) => (
        <button type="button" key={c} className={`svg-edit-dot square${c === fg ? " on" : ""}`} data-testid={`${testid}-saved-${c.slice(1)}`}
          style={{ background: c }} title={`${c} — click to use · right-click removes`} aria-label={`Use saved ${c}`}
          onClick={(e) => (e.altKey ? drop(c) : setFg(c))} onContextMenu={(e) => { e.preventDefault(); drop(c); }} />
      ))}
      <button type="button" className="svg-edit-dot square add" data-testid={`${testid}-save`} disabled={swatches.includes(fg)}
        title="Save the current colour as a swatch" aria-label="Save the current colour as a swatch" onClick={() => changePalette((p) => saveSwatch(p, p.fg))}>+</button>
    </span>
  );
}

export interface EditColorBarProps {
  testid: string;
  /** How many shapes are selected ("fill selected" needs one). */
  selected: number;
  onFillSelected: () => void;
}

export default function EditColorBar({ testid, selected, onFillSelected }: EditColorBarProps) {
  const { fg, bg, swatches } = usePalette();
  const prefix = `${testid}-color`;
  return (
    <span className="svg-edit-colors" data-testid={prefix}>
      <ColorPair testid={prefix} fg={fg} bg={bg} />
      <HexField testid={prefix} fg={fg} />
      {screenPicker() !== undefined && (
        <button type="button" className="svg-btn tiny" data-testid={`${prefix}-screen`} title="Pick a colour from anywhere on the screen"
          onClick={() => { void pickFromScreen(); }}>⌖</button>
      )}
      <span className="svg-edit-swatches" title="Colours close to the current one">
        <SmartSwatches current={fg} onPick={(c) => setFg(c)} prefix={prefix} dotClass="svg-edit-dot" customClass="custom" />
      </span>
      <Saved testid={prefix} fg={fg} swatches={swatches} />
      <button type="button" className="svg-btn tiny" data-testid={`${prefix}-fill-selected`} disabled={selected === 0}
        title="Fill the selected shapes with the current colour" onClick={onFillSelected}>▣ Fill selected</button>
    </span>
  );
}

// UploadArtboardSettings.tsx — the artboard block of the export settings
// dialog (moved out of UploadSettingsDialog.tsx on 2026-10-09, RULE 18): the
// artboard mode (fit the artwork / a square preset / a custom width × height
// with its ratio and megapixels) and the "Scale to N MP" row (I-62) — in
// `content` mode the artwork (icon + padding) is scaled uniformly so the
// artboard's area is N × 10⁶ px², strokes keeping their verbatim px; a pinned
// artboard decides the megapixels itself, so the row is disabled and says so.
// Every change is live (RULE 24) through the ONE write path in settingsfield;
// the custom W×H commit when their field is left (2026-10-19, ui/DraftNumberInput).

import {
  ARTBOARD_MAX, ARTBOARD_MIN, ARTBOARD_PRESETS, artboardSize, clampArtboard, clampArtboardMegapixels,
  MP_MAX, MP_MIN, type Artboard, type UploadSettings,
} from "../lib/upload/settings";
import DraftNumberInput from "../ui/DraftNumberInput";
import { Marker, change, type UploadSettingsDialogProps } from "./settingsfield";

interface BlockProps { p: UploadSettingsDialogProps; effective: UploadSettings }

/**
 * The artboard: the final px size of the export. `content` hugs the artwork
 * (padding as a share of it); a preset or a custom width×height pins EXACT px,
 * scaling the artwork into that box — which is where the aspect ratio lives.
 */
export function ArtboardSetting({ p, effective }: BlockProps) {
  const a = effective.artboard;
  const pinned = artboardSize(a);
  const patch = (next: Partial<Artboard>) => change(p, "artboard", clampArtboard({ ...a, ...next }));
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Artboard<Marker p={p} field="artboard" testid="artboard" /></span>
      <select className="svg-input" data-testid="upload-set-artboard" aria-label="Artboard size"
        value={a.mode === "preset" ? String(a.size) : a.mode}
        onChange={(e) => patch(fromChoice(e.target.value, a))}>
        <option value="source">Default (the SVG's own)</option>
        <option value="content">Fit the artwork</option>
        {ARTBOARD_PRESETS.map((size) => <option key={size} value={String(size)}>{size}×{size}</option>)}
        <option value="custom">Custom…</option>
      </select>
      {a.mode === "custom" && <CustomSize a={a} patch={patch} />}
      <small className="up-hint" data-testid="upload-set-artboard-note">{a.mode === "source" ? SOURCE_NOTE : artboardNote(pinned)}</small>
      <MegapixelRow p={p} effective={effective} />
    </div>
  );
}

/** The custom width × height, and the ratio they spell out — each checked when its field is left, never per keystroke. */
function CustomSize({ a, patch }: { a: Artboard; patch: (next: Partial<Artboard>) => void }) {
  return (
    <div className="up-bg-row">
      <DraftNumberInput testid="upload-set-artboard-w" label="Artboard width in px" min={ARTBOARD_MIN} max={ARTBOARD_MAX} step={1}
        value={a.width} onCommit={(n) => { if (n !== null) patch({ width: n }); }} />
      <output className="svg-bg-value" data-testid="upload-set-artboard-ratio">{ratioOf(a)}</output>
      <DraftNumberInput testid="upload-set-artboard-h" label="Artboard height in px" min={ARTBOARD_MIN} max={ARTBOARD_MAX} step={1}
        value={a.height} onCommit={(n) => { if (n !== null) patch({ height: n }); }} />
      <output className="svg-bg-value" data-testid="upload-set-artboard-mp">{mpOf(a)}</output>
    </div>
  );
}

/**
 * "Scale to N MP" (I-62): one checkbox and the target. Only a content-hugging
 * artboard can be scaled to an area — a pinned size already decides its
 * megapixels, so there the row is disabled and the note says why.
 */
function MegapixelRow({ p, effective }: BlockProps) {
  const pinned = effective.artboard.mode !== "content"; // a pinned size or the source's own decides
  const on = effective.scaleToMegapixels && !pinned;
  return (
    <div className="up-bg-row">
      <label className="up-hint up-set-field">
        <input data-testid="upload-set-mp-scale" type="checkbox" aria-label="Scale the artboard to megapixels"
          checked={effective.scaleToMegapixels} disabled={pinned}
          onChange={(e) => change(p, "scaleToMegapixels", e.target.checked)} />
        {" scale to "}
        <Marker p={p} field="scaleToMegapixels" testid="mp-scale" />
      </label>
      <input className="svg-input" data-testid="upload-set-mp-target" type="number" aria-label="Artboard megapixels"
        min={MP_MIN} max={MP_MAX} step={0.1} value={effective.artboardMegapixels} disabled={!on}
        onChange={(e) => change(p, "artboardMegapixels", clampArtboardMegapixels(Number(e.target.value)))} />
      <span className="up-hint">MP<Marker p={p} field="artboardMegapixels" testid="mp-target" /></span>
      <small className="up-hint" data-testid="upload-set-mp-scale-note">{megapixelNote(pinned, effective.artboardMegapixels)}</small>
    </div>
  );
}

/** The select's value → the artboard it means (a preset keeps its square edge). */
function fromChoice(choice: string, a: Artboard): Partial<Artboard> {
  if (choice === "content" || choice === "source") return { mode: choice };
  if (choice === "custom") return { mode: "custom", width: a.mode === "custom" ? a.width : 512, height: a.mode === "custom" ? a.height : 512 };
  return { mode: "preset", size: Number(choice) };
}

const SOURCE_NOTE = "default — the SVG's own viewBox size and aspect ratio";

function artboardNote(pinned: { width: number; height: number } | null): string {
  if (pinned === null) return "hugs the artwork — the padding is a share of its largest side";
  return `exactly ${pinned.width}×${pinned.height} px, artwork scaled in, padding a share of the artboard`;
}

function megapixelNote(pinned: boolean, megapixels: number): string {
  if (pinned) return "the pinned size decides the megapixels";
  return `the artboard (icon + padding) is scaled to ${megapixels} MP · strokes keep their px`;
}

/** A readable ratio: 16:9, 2:1, or the reduced integer pair. */
function ratioOf(a: Artboard): string {
  const g = gcd(a.width, a.height);
  return `${Math.round(a.width / g)}:${Math.round(a.height / g)}`;
}

function mpOf(a: Artboard): string {
  return `${((a.width * a.height) / 1e6).toFixed(2)} MP`;
}

function gcd(x: number, y: number): number {
  return y === 0 ? Math.max(1, x) : gcd(y, x % y);
}

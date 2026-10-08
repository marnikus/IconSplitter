// UploadSettingsDialog.tsx — the export settings dialog (design §4.1): global
// defaults (from the toolbar) or one icon's overrides (from its row), with the
// inherited/overridden marker per field, the background presets plus a custom
// picker, and Reset-to-defaults for the icon scope. Every change is live
// (RULE 24): the global scope edits the defaults, the icon scope pins the
// field into that icon's override — both validated by lib/upload/settings.

import {
  BG_PRESETS, normalizeHex,
} from "../lib/svgbackground";
import {
  ARTBOARD_MAX, ARTBOARD_MIN, ARTBOARD_PRESETS, artboardSize, clampArtboard,
  clampMegapixels, clampPaddingPct, clampQuality, clampStrokePt,
  MP_MAX, MP_MIN, PADDING_MAX, PADDING_MIN, QUALITY_MAX, QUALITY_MIN, STROKE_MAX, STROKE_MIN,
  type Artboard, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";

export interface UploadSettingsDialogProps {
  /** null = the global defaults; else the icon's file name. */
  scope: string | null;
  /** null = the global scope; else the pair id whose override is edited. */
  id: string | null;
  defaults: UploadSettings;
  /** The icon's current override ({} in the global scope). */
  overrides: SettingsOverrides;
  onDefaults: (patch: Partial<UploadSettings>) => void;
  onOverride: (id: string, patch: SettingsOverrides) => void;
  onResetOverride: (id: string) => void;
  onClose: () => void;
}

export default function UploadSettingsDialog(p: UploadSettingsDialogProps) {
  const effective = { ...p.defaults, ...p.overrides };
  return (
    <div className="svg-backdrop" data-testid="upload-dialog-backdrop" onClick={p.onClose}>
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title"
        onClick={(e) => e.stopPropagation()}>
        <header className="svg-modal-head">
          <h2 id="upload-dialog-title">Export settings{p.id === null ? " — global defaults" : ` — ${p.scope}`}</h2>
          <button type="button" className="svg-btn tiny" data-testid="upload-set-close" onClick={p.onClose}>Close</button>
        </header>
        <DialogBody p={p} effective={effective} />
      </section>
    </div>
  );
}

/** The body: the scope note, every field, and the icon scope's reset. */
function DialogBody({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <div className="svg-modal-body">
      <p className="svg-note" data-testid="upload-dialog-scope">
        {p.id === null
          ? "Every icon without its own override inherits these defaults."
          : "Fields marked overridden are pinned for this icon; the rest inherit the global defaults."}
      </p>
      <SettingsGrid p={p} effective={effective} />
      {p.id !== null && (
        <div className="up-set-footer">
          <button type="button" className="svg-btn" data-testid="upload-set-reset"
            onClick={() => p.onResetOverride(p.id as string)}>Reset to defaults</button>
          <span className="up-hint">deletes this icon's override — it inherits the global defaults again</span>
        </div>
      )}
    </div>
  );
}

/** The seven settings, one field component each. */
function SettingsGrid({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <div className="up-set-grid">
      <NumberSetting p={p} effective={effective} field="paddingPct" label="Padding %" testid="padding"
        min={PADDING_MIN} max={PADDING_MAX} step={1} clamp={clampPaddingPct}
        hint="uniform, % of the fitted artwork's largest side" />
      <NumberSetting p={p} effective={effective} field="strokePt" label="Stroke width (pt)" testid="stroke"
        min={STROKE_MIN} max={STROKE_MAX} step={0.1} clamp={clampStrokePt}
        hint="0 = leave the artwork's strokes untouched · 1 pt = 4/3 px at 96 DPI" />
      <ArtboardSetting p={p} effective={effective} />
      <MegapixelSetting p={p} effective={effective} />
      <NumberSetting p={p} effective={effective} field="jpegQuality" label="JPEG quality" testid="quality"
        min={QUALITY_MIN} max={QUALITY_MAX} step={0.01} clamp={clampQuality} hint="0.5 – 1" />
      <ToggleSetting p={p} effective={effective} field="optimizeSvg" label="Optimize SVG (SVGO)" testid="optimize"
        hint="the export copy only — viewBox, geometry, strokes and metadata are preserved" />
      <ToggleSetting p={p} effective={effective} field="includeEps" label="Also write EPS" testid="eps"
        hint="a genuine EPS for the documented subset; anything else fails that stage honestly" />
      <BackgroundSetting p={p} effective={effective} />
    </div>
  );
}

/** The marker a field carries in the icon scope: pinned, or inherited. */
function markerOf(p: UploadSettingsDialogProps, field: keyof UploadSettings): string | null {
  if (p.id === null) return null;
  return p.overrides[field] !== undefined ? "overridden" : "inherited";
}

function Marker({ p, field, testid }: { p: UploadSettingsDialogProps; field: keyof UploadSettings; testid: string }) {
  const marker = markerOf(p, field);
  if (marker === null) return null;
  return <em className={`up-marker ${marker}`} data-testid={`upload-set-marker-${testid}`}>{marker}</em>;
}

/** One numeric setting: live, clamped at the moment of change (RULE 13). */
function NumberSetting({ p, effective, field, label, testid, min, max, step, clamp, hint }: {
  p: UploadSettingsDialogProps; effective: UploadSettings; field: keyof UploadSettings;
  label: string; testid: string; min: number; max: number; step: number;
  clamp: (v: unknown) => number; hint: string;
}) {
  const value = effective[field] as number;
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}<Marker p={p} field={field} testid={testid} /></span>
      <input className="svg-input" data-testid={`upload-set-${testid}`} type="number" aria-label={label}
        min={min} max={max} step={step} value={value}
        onChange={(e) => change(p, field, clamp(Number(e.target.value)))} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

/** One boolean setting: one checkbox, one decision (RULE 10). */
function ToggleSetting({ p, effective, field, label, testid, hint }: {
  p: UploadSettingsDialogProps; effective: UploadSettings; field: keyof UploadSettings;
  label: string; testid: string; hint: string;
}) {
  const value = effective[field] as boolean;
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}<Marker p={p} field={field} testid={testid} /></span>
      <input data-testid={`upload-set-${testid}`} type="checkbox" aria-label={label} checked={value}
        onChange={(e) => change(p, field, e.target.checked)} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

/**
 * The artboard: the final px size of the export. `content` hugs the artwork
 * (padding as a share of it); a preset or a custom width×height pins EXACT px,
 * scaling the artwork into that box — which is where the aspect ratio lives.
 */
function ArtboardSetting({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const a = effective.artboard;
  const pinned = artboardSize(a);
  const patch = (next: Partial<Artboard>) => change(p, "artboard", clampArtboard({ ...a, ...next }));
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Artboard<Marker p={p} field="artboard" testid="artboard" /></span>
      <select className="svg-input" data-testid="upload-set-artboard" aria-label="Artboard size"
        value={a.mode === "preset" ? String(a.size) : a.mode}
        onChange={(e) => patch(fromChoice(e.target.value, a))}>
        <option value="content">Fit the artwork</option>
        {ARTBOARD_PRESETS.map((size) => <option key={size} value={String(size)}>{size}×{size}</option>)}
        <option value="custom">Custom…</option>
      </select>
      {a.mode === "custom" && <CustomSize a={a} patch={patch} />}
      <small className="up-hint" data-testid="upload-set-artboard-note">{artboardNote(pinned)}</small>
    </div>
  );
}

/** The custom width × height, and the ratio they spell out. */
function CustomSize({ a, patch }: { a: Artboard; patch: (next: Partial<Artboard>) => void }) {
  return (
    <div className="up-bg-row">
      <input className="svg-input" type="number" data-testid="upload-set-artboard-w" aria-label="Artboard width in px"
        min={ARTBOARD_MIN} max={ARTBOARD_MAX} step={1} value={a.width}
        onChange={(e) => patch({ width: Number(e.target.value) })} />
      <output className="svg-bg-value" data-testid="upload-set-artboard-ratio">{ratioOf(a)}</output>
      <input className="svg-input" type="number" data-testid="upload-set-artboard-h" aria-label="Artboard height in px"
        min={ARTBOARD_MIN} max={ARTBOARD_MAX} step={1} value={a.height}
        onChange={(e) => patch({ height: Number(e.target.value) })} />
      <output className="svg-bg-value" data-testid="upload-set-artboard-mp">{mpOf(a)}</output>
    </div>
  );
}

/** The select's value → the artboard it means (a preset keeps its square edge). */
function fromChoice(choice: string, a: Artboard): Partial<Artboard> {
  if (choice === "content") return { mode: "content" };
  if (choice === "custom") return { mode: "custom", width: a.mode === "custom" ? a.width : 512, height: a.mode === "custom" ? a.height : 512 };
  return { mode: "preset", size: Number(choice) };
}

function artboardNote(pinned: { width: number; height: number } | null): string {
  if (pinned === null) return "hugs the artwork — the padding is a share of its largest side";
  return `exactly ${pinned.width}×${pinned.height} px, artwork scaled in, padding a share of the artboard`;
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

/**
 * The JPEG resolution. NEVER blocked (2026-10-08): a small artboard must not cap
 * it, so the field always accepts a number. When the artboard pins a px size the
 * checkbox says whether the JPEG follows it (the default) or renders at the
 * megapixels the user typed, keeping the artboard's ratio.
 */
function MegapixelSetting({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const pinned = artboardSize(effective.artboard);
  // Typing a resolution is the user deciding for the megapixels: one gesture,
  // so it also unticks "same size as the artboard" in the same change.
  const onPixels = (value: number) => {
    const megapixels = clampMegapixels(value);
    if (pinned === null) return change(p, "jpegMegapixels", megapixels);
    changeMany(p, { jpegMegapixels: megapixels, jpegMatchArtboard: false });
  };
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">JPEG (MP)<Marker p={p} field="jpegMegapixels" testid="mp" /></span>
      <input className="svg-input" data-testid="upload-set-mp" type="number" aria-label="JPEG megapixels"
        min={MP_MIN} max={MP_MAX} step={0.1} value={effective.jpegMegapixels}
        onChange={(e) => onPixels(Number(e.target.value))} />
      {pinned !== null && <MatchArtboard p={p} effective={effective} />}
      <small className="up-hint" data-testid="upload-set-mp-note">
        {pinned === null
          ? "rendered from the vectors at this resolution (default 15.1)"
          : mpNote(pinned, effective.jpegMatchArtboard)}
      </small>
    </div>
  );
}

/** The choice a pinned artboard creates: same px as the artboard, or the MP above. */
function MatchArtboard({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <label className="up-hint up-set-field">
      <input data-testid="upload-set-mp-match" type="checkbox" aria-label="Same size as the artboard"
        checked={effective.jpegMatchArtboard}
        onChange={(e) => change(p, "jpegMatchArtboard", e.target.checked)} />
      {" same size as the artboard"}
      <Marker p={p} field="jpegMatchArtboard" testid="mp-match" />
    </label>
  );
}

/** What the JPEG will really be, given the artboard and the resolution choice. */
function mpNote(pinned: { width: number; height: number }, match = true): string {
  return match
    ? `the JPEG is the artboard itself: ${pinned.width}×${pinned.height} px — untick for a bigger file`
    : "rendered from the vectors at this resolution, at the artboard's aspect ratio";
}

/** The background: the five presets plus one custom picker (I-17/I-21). */
function BackgroundSetting({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const field = "background" as const;
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Background<Marker p={p} field={field} testid="bg" /></span>
      <div className="up-bg-row">
        {BG_PRESETS.map((preset) => (
          <button key={preset.id} type="button"
            className={`svg-swatch${effective.background === preset.color ? " on" : ""}`}
            data-testid={`upload-set-bg-${preset.id}`} title={preset.label} aria-label={`Background ${preset.label}`}
            aria-pressed={effective.background === preset.color} style={{ background: preset.color }}
            onClick={() => change(p, field, preset.color)} />
        ))}
        <input type="color" data-testid="upload-set-bg-custom" aria-label="Custom background"
          value={effective.background}
          onChange={(e) => { const hex = normalizeHex(e.target.value); if (hex !== null) change(p, field, hex); }} />
        <output className="svg-bg-value" data-testid="upload-set-bg-value">{effective.background}</output>
      </div>
      <small className="up-hint">the JPEG flattens onto it; the artwork is never recoloured</small>
    </div>
  );
}

/** One field change → the global defaults or the icon's override (live). */
function change<K extends keyof UploadSettings>(p: UploadSettingsDialogProps, field: K, value: UploadSettings[K]): void {
  changeMany(p, { [field]: value });
}

/** Several fields at once — one gesture, one undoable override entry. */
function changeMany(p: UploadSettingsDialogProps, patch: Partial<UploadSettings>): void {
  if (p.id === null) {
    p.onDefaults(patch);
    return;
  }
  p.onOverride(p.id, { ...p.overrides, ...patch });
}

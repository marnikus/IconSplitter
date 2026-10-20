// UploadSettingsDialog.tsx — the export settings dialog (design §4.1): global
// defaults (from the toolbar) or one icon's overrides (from its row), with the
// inherited/overridden marker per field, and Reset-to-defaults for the icon
// scope. Every change is live (RULE 24): the global scope edits the defaults,
// the icon scope pins the field into that icon's override — both validated by
// lib/upload/settings. The shared row plumbing lives in settingsfield.tsx, the
// two paint rows (background, stroke colour) in UploadPaintSettings.tsx, the
// EPS converter list + Inkscape helper row in UploadEpsSettings.tsx, the
// artboard block + "Scale to N MP" row in UploadArtboardSettings.tsx.
// 2026-10-19 (archive/2026-10-19-upload-default-settings): every visual row has
// a "default" (leave the source's own), "All default" sets them at once (the
// export is then the approved SVG, as is), and the global stroke WIDTH is the
// bar's STROKE field; only the icon scope has a width row — that icon's own value.

import {
  artboardSize, clampMegapixels, clampPaddingPct, clampQuality, clampStrokePx, STROKE_MAX, STROKE_MIN,
  MP_MAX, MP_MIN, PADDING_DEFAULT, PADDING_MAX, PADDING_MIN, QUALITY_MAX, QUALITY_MIN,
  type UploadSettings,
} from "../lib/upload/settings";
import { AS_IS_SETTINGS, isAsIs } from "../lib/upload/asis";
import { paintClash } from "../lib/upload/paintclash";
import DraftNumberInput from "../ui/DraftNumberInput";
import { Marker, change, changeMany, type UploadSettingsDialogProps } from "./settingsfield";
import { BackgroundSetting, StrokeColorSetting } from "./UploadPaintSettings";
import { ConverterSetting } from "./UploadEpsSettings";
import { ArtboardSetting } from "./UploadArtboardSettings";
import UploadShadowSettings from "./UploadShadowSettings";
import UploadBadgeSettings from "./UploadBadgeSettings";

export type { UploadSettingsDialogProps } from "./settingsfield";

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
          ? "General settings are inherited; the Checked icons Shadow and Badge checkboxes below apply only to the current selection."
          : "Fields marked overridden are pinned for this icon; the rest inherit the global defaults."}
      </p>
      <AsIsRow p={p} effective={effective} />
      <PaintClashNote effective={effective} />
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

/** The settings, one field component each; the paint rows come from UploadPaintSettings. */
function SettingsGrid({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <div className="up-set-grid">
      <PaddingSetting p={p} effective={effective} />
      {p.id !== null && <IconStrokeSetting p={p} id={p.id} />}
      <StrokeColorSetting p={p} effective={effective} />
      <ArtboardSetting p={p} effective={effective} />
      <UploadShadowSettings p={p} effective={effective} />
      <UploadBadgeSettings p={p} effective={effective} />
      <MegapixelSetting p={p} effective={effective} />
      <NumberSetting p={p} effective={effective} field="jpegQuality" label="JPEG quality" testid="quality"
        min={QUALITY_MIN} max={QUALITY_MAX} step={0.01} clamp={clampQuality} hint="0.5 – 1" />
      <ToggleSetting p={p} effective={effective} field="optimizeSvg" label="Optimize SVG (SVGO)" testid="optimize"
        hint={isAsIs(effective) ? "skipped while every visual setting is default — the SVG ships as is" : "the export copy only — viewBox, geometry, strokes and metadata are preserved"} />
      <ToggleSetting p={p} effective={effective} field="includeEps" label="Also write EPS" testid="eps"
        hint="a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly" />
      <ConverterSetting p={p} effective={effective} />
      <ToggleSetting p={p} effective={effective} field="expandStrokes" label="Expand strokes to fills" testid="expand"
        hint="strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes" />
      <BackgroundSetting p={p} effective={effective} />
    </div>
  );
}

/** "All default": the five visual fields at once (one gesture; in the icon scope a pinned stroke width of 0). */
function AsIsRow({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const on = isAsIs(effective);
  return (
    <div className="up-set-footer">
      <button type="button" className={`svg-btn${on ? " on" : ""}`} data-testid="upload-set-as-is" aria-pressed={on}
        onClick={() => changeMany(p, { ...AS_IS_SETTINGS, shadowEnabled: false, badgeEnabled: false })}>All default (export as is)</button>
      <span className="up-hint" data-testid="upload-set-as-is-note">
        {on ? "every visual setting is default: the approved SVG is exported exactly as it is"
          : p.id === null ? "reset global visual defaults; checked icons keep their separately applied shadows and badges"
            : "stroke, background, artboard and padding back to the SVG's own; this icon's shadow and badge off"}
      </span>
    </div>
  );
}

/**
 * One icon's own stroke width (icon scope only): empty = the bar's value,
 * inherited; a number pins it (0 = the artwork's own widths). Committed when
 * the field is left, so typing "12" never writes "1" on the way.
 */
function IconStrokeSetting({ p, id }: { p: UploadSettingsDialogProps; id: string }) {
  const pinned = p.overrides.strokePx;
  const bar = p.defaults.strokePx > 0 ? `${p.defaults.strokePx} px` : "default";
  const inherit = () => { const { strokePx, ...rest } = p.overrides; void strokePx; p.onOverride(id, rest); };
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Stroke width px<Marker p={p} field="strokePx" testid="stroke" /></span>
      <div className="up-bg-row">
        <button type="button" className={`svg-btn tiny up-default-btn${pinned === undefined ? " on" : ""}`} data-testid="upload-set-stroke-inherit"
          aria-pressed={pinned === undefined} onClick={inherit}>Bar ({bar})</button>
        <DraftNumberInput testid="upload-set-stroke" label="This icon's stroke width in px" min={STROKE_MIN} max={STROKE_MAX} step={0.1}
          value={pinned ?? null} placeholder={`bar: ${bar}`}
          onCommit={(n) => (n === null ? inherit() : change(p, "strokePx", clampStrokePx(n)))} />
      </div>
      <small className="up-hint">{pinned === undefined ? "follows the bar's STROKE" : pinned === 0 ? "this icon keeps the artwork's own widths" : "this icon only — the bar's STROKE no longer changes it"}</small>
    </div>
  );
}

/** Strokes the chosen background would hide — said before anything is exported. */
function PaintClashNote({ effective }: { effective: UploadSettings }) {
  const clash = paintClash(effective);
  return clash === null ? null : <p className="svg-warning" role="alert" data-testid="upload-set-paint-clash">⚠ {clash}</p>;
}

/** Padding: a % of the artwork's largest side, or default — the SVG's own margins. */
function PaddingSetting({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const value = effective.paddingPct;
  return (
    <div className="svg-field up-set-field">
      <label className="svg-label" htmlFor="upload-set-padding">Padding %<Marker p={p} field="paddingPct" testid="padding" /></label>
      <div className="up-bg-row">
        <button type="button" className={`svg-btn tiny up-default-btn${value === null ? " on" : ""}`} data-testid="upload-set-padding-default"
          aria-pressed={value === null} onClick={() => change(p, "paddingPct", value === null ? PADDING_DEFAULT : null)}>Default</button>
        <input id="upload-set-padding" className="svg-input" data-testid="upload-set-padding" type="number" aria-label="Padding %"
          min={PADDING_MIN} max={PADDING_MAX} step={1} value={value ?? ""} placeholder="default"
          onChange={(e) => change(p, "paddingPct", e.target.value === "" ? null : clampPaddingPct(Number(e.target.value)))} />
      </div>
      <small className="up-hint">{value === null ? "default — the SVG's own margins" : "uniform, % of the fitted artwork's largest side"}</small>
    </div>
  );
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

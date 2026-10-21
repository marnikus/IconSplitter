// UploadSizeGuideSettings.tsx — the S/L size guide: the finished icon repeated
// at two smaller sizes in one artboard corner, each labelled with the supplied
// S and L letter outlines. ONE control set: the selected-only checkbox in the
// global popup and the placement percentages below it (2026-10-20).
import {
  clampSizeGuideGapPct, clampSizeGuideLargePct, clampSizeGuideOffsetPct, clampSizeGuideSmallPct,
  clampSizeGuideStrokePct, parseSizeGuideCorner, SIZE_GUIDE_CORNERS,
  SIZE_GUIDE_GAP_MAX, SIZE_GUIDE_GAP_MIN, SIZE_GUIDE_LARGE_MAX, SIZE_GUIDE_LARGE_MIN,
  SIZE_GUIDE_OFFSET_MAX, SIZE_GUIDE_OFFSET_MIN, SIZE_GUIDE_SMALL_MAX, SIZE_GUIDE_SMALL_MIN,
  SIZE_GUIDE_STROKE_MAX, SIZE_GUIDE_STROKE_MIN,
  type SizeGuideCorner, type UploadSettings,
} from "../lib/upload/settings";
import DraftNumberInput from "../ui/DraftNumberInput";
import { change, changeMany, Marker, type SettingsFieldProps } from "./settingsfield";

type Placement = Pick<UploadSettings,
  "sizeGuideCorner" | "sizeGuideSmallPct" | "sizeGuideLargePct" | "sizeGuideSmallStrokePct"
  | "sizeGuideLargeStrokePct" | "sizeGuideGapPct" | "sizeGuideOffsetXPct" | "sizeGuideOffsetYPct">;

interface NumberWant {
  testid: string; label: string; hint?: string;
  /** The screen-reader name; defaults to the visible label. */
  aria?: string;
  value: number; min: number; max: number; step: number;
  onCommit: (n: number) => void; marker?: React.ReactNode;
}

export default function UploadSizeGuideSettings({ p, effective }: SettingsFieldProps) {
  return (
    <div className="up-shadow-dialog" data-testid="upload-set-sizeguide-section">
      {p.id === null ? <SelectedSizeGuideToggle p={p} /> : <PerIconSizeGuideToggle p={p} effective={effective} />}
      {p.id === null && <small className="up-hint" data-testid="upload-sizeguide-defaults-note">
        These defaults change the two logos' sizes and placement, but never turn on an unchecked icon.
      </small>}
      <SizeGuideFields p={p} effective={effective} />
    </div>
  );
}

/** The selected checkbox lives in the global popup; the one placement set below is its defaults. */
function SelectedSizeGuideToggle({ p }: { p: SettingsFieldProps["p"] }) {
  const state = p.selectedSizeGuide.state;
  return (
    <div className="up-shadow-controls" data-testid="upload-sizeguide-controls">
      <div className="svg-field up-set-field">
        <span className="svg-label">Checked icons ({p.selectedCount})</span>
        <label className="up-shadow-check">
          <input type="checkbox" data-testid="upload-set-sizeguide-selected" aria-label="Size guide on checked icons"
            checked={state === "all"} disabled={p.selectedCount === 0} onChange={p.onSelectedSizeGuideToggle}
            ref={(el) => { if (el) el.indeterminate = state === "mixed"; }} />
          Size guide {state === "mixed" ? "(some on)" : state === "all" ? "(all on)" : "(off)"}
        </label>
        <small className="up-hint">{p.selectedCount === 0
          ? "Select icons to add the size guide."
          : "Only checked icons, including checks hidden by a filter."}</small>
      </div>
    </div>
  );
}

function PerIconSizeGuideToggle({ p, effective }: SettingsFieldProps) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Size guide<Marker p={p} field="sizeGuideEnabled" testid="sizeguide" /></span>
      <label className="up-shadow-check">
        <input type="checkbox" data-testid="upload-set-sizeguide" aria-label="Size guide on this icon"
          checked={effective.sizeGuideEnabled} onChange={(e) => change(p, "sizeGuideEnabled", e.target.checked)} />
        Add the S and L sizes
      </label>
      <small className="up-hint">The finished icon twice, smaller, with its S and L letter outlines underneath.</small>
    </div>
  );
}

/** One placement set: global defaults in the global popup, that icon's pins in the icon popup. */
function SizeGuideFields({ p, effective }: SettingsFieldProps) {
  const update = (patch: Partial<Placement>) => changeMany(p, patch);
  const marker = (field: keyof UploadSettings, testid: string) => <Marker p={p} field={field} testid={testid} />;
  const fields: FieldsProps = { p, effective, update, marker };
  return (
    <fieldset className="up-shadow-fields" disabled={p.id !== null && !effective.sizeGuideEnabled}>
      {p.id === null && <legend className="svg-label">Size guide defaults</legend>}
      <SizeGuidePlacement {...fields} />
      <SizeGuideLogo {...fields} side="S" />
      <SizeGuideLogo {...fields} side="L" />
      <SizeGuideSpacing {...fields} />
      <small className="up-hint" data-testid="upload-sizeguide-fit-note">
        The pair shrinks uniformly to keep these insets inside the artboard; a 100% inset leaves no room and export reports it.
      </small>
      {effective.expandStrokes && <p className="svg-warning" data-testid="upload-sizeguide-expand-note">
        Expand strokes ships the outline only: the repeats copy that finished outline, so a repeat's own stroke width has nothing to restyle.
      </p>}
    </fieldset>
  );
}

interface FieldsProps {
  p: SettingsFieldProps["p"];
  effective: UploadSettings;
  update: (patch: Partial<Placement>) => void;
  marker: (field: keyof UploadSettings, testid: string) => React.ReactNode;
}

/** Where the group sits: the corner and both inward distances, labelled from those edges. */
function SizeGuidePlacement({ p, effective, update, marker }: FieldsProps) {
  return (
    <div className="up-guide-block" data-testid="upload-sizeguide-placement" role="group" aria-label="Size guide placement">
      <span className="svg-label">Placement</span>
      <SizeGuideCornerField testid="upload-set-sizeguide-corner" value={effective.sizeGuideCorner}
        marker={marker("sizeGuideCorner", "sizeguide-corner")} onChange={(v) => {
          const corner = parseSizeGuideCorner(v);
          if (corner !== null) update({ sizeGuideCorner: corner });
        }} />
      <SizeGuideNumber field={{ testid: "upload-set-sizeguide-offset-x", label: insetLabel(effective.sizeGuideCorner, "x"),
        value: effective.sizeGuideOffsetXPct, min: SIZE_GUIDE_OFFSET_MIN, max: SIZE_GUIDE_OFFSET_MAX, step: 1,
        marker: <Marker p={p} field="sizeGuideOffsetXPct" testid="sizeguide-offset-x" />,
        onCommit: (n) => update({ sizeGuideOffsetXPct: clampSizeGuideOffsetPct(n) }) }} />
      <SizeGuideNumber field={{ testid: "upload-set-sizeguide-offset-y", label: insetLabel(effective.sizeGuideCorner, "y"),
        value: effective.sizeGuideOffsetYPct, min: SIZE_GUIDE_OFFSET_MIN, max: SIZE_GUIDE_OFFSET_MAX, step: 1,
        marker: <Marker p={p} field="sizeGuideOffsetYPct" testid="sizeguide-offset-y" />,
        onCommit: (n) => update({ sizeGuideOffsetYPct: clampSizeGuideOffsetPct(n) }) }} />
    </div>
  );
}

/** One logo's own two numbers, kept in one place so the labels cannot cross. */
interface LogoSide {
  side: "S" | "L";
  name: "small" | "large";
  width: number;
  stroke: number;
  widthClamp: (v: number) => number;
  strokeClamp: (v: number) => number;
  limits: { widthMin: number; widthMax: number };
  widthMarker: React.ReactNode;
  strokeMarker: React.ReactNode;
}

/** ONE logo: its width and its OWN stroke width together, so the pair cannot be mistaken for the other logo's. */
function SizeGuideLogo({ effective, update, marker, side }: FieldsProps & { side: "S" | "L" }) {
  const want = logoSideOf(effective, side, marker);
  return (
    <div className="up-guide-block" data-testid={`upload-sizeguide-${want.name}`} role="group"
      aria-label={`${want.side} — ${want.name} logo`}>
      <span className="svg-label">{want.side} — {want.name} logo</span>
      <SizeGuideNumber field={{
        testid: `upload-set-sizeguide-${want.name}-width`, label: "Width % of artboard",
        aria: `${want.side} logo width as percent of artboard width`,
        hint: want.side === "S" ? "S sits first, left of L" : "both logos share one baseline",
        value: want.width, min: want.limits.widthMin, max: want.limits.widthMax, step: 1,
        marker: want.widthMarker, onCommit: (n) => update(widthPatchOf(want, n)),
      }} />
      <SizeGuideNumber field={{
        testid: `upload-set-sizeguide-${want.name}-stroke`, label: "Stroke width %",
        aria: `${want.side} logo stroke width as percent of artboard width`,
        hint: "0 keeps the artwork's scaled widths", value: want.stroke,
        min: SIZE_GUIDE_STROKE_MIN, max: SIZE_GUIDE_STROKE_MAX, step: 0.1,
        marker: want.strokeMarker, onCommit: (n) => update(strokePatchOf(want, n)),
      }} />
    </div>
  );
}

function logoSideOf(effective: UploadSettings, side: "S" | "L", marker: FieldsProps["marker"]): LogoSide {
  const small = side === "S";
  return {
    side, name: small ? "small" : "large",
    width: small ? effective.sizeGuideSmallPct : effective.sizeGuideLargePct,
    stroke: small ? effective.sizeGuideSmallStrokePct : effective.sizeGuideLargeStrokePct,
    widthClamp: small ? clampSizeGuideSmallPct : clampSizeGuideLargePct,
    strokeClamp: clampSizeGuideStrokePct,
    limits: small ? { widthMin: SIZE_GUIDE_SMALL_MIN, widthMax: SIZE_GUIDE_SMALL_MAX }
      : { widthMin: SIZE_GUIDE_LARGE_MIN, widthMax: SIZE_GUIDE_LARGE_MAX },
    widthMarker: small ? marker("sizeGuideSmallPct", "sizeguide-small") : marker("sizeGuideLargePct", "sizeguide-large"),
    strokeMarker: small ? marker("sizeGuideSmallStrokePct", "sizeguide-small-stroke")
      : marker("sizeGuideLargeStrokePct", "sizeguide-large-stroke"),
  };
}

function widthPatchOf(want: LogoSide, n: number): Partial<Placement> {
  return want.name === "small"
    ? { sizeGuideSmallPct: want.widthClamp(n) }
    : { sizeGuideLargePct: want.widthClamp(n) };
}

function strokePatchOf(want: LogoSide, n: number): Partial<Placement> {
  return want.name === "small"
    ? { sizeGuideSmallStrokePct: want.strokeClamp(n) }
    : { sizeGuideLargeStrokePct: want.strokeClamp(n) };
}

/** The user-defined clear distance between S and L. */
function SizeGuideSpacing({ effective, update, marker }: FieldsProps) {
  return (
    <div className="up-guide-block" data-testid="upload-sizeguide-spacing" role="group" aria-label="Size guide spacing">
      <span className="svg-label">Spacing</span>
      <SizeGuideNumber field={{ testid: "upload-set-sizeguide-gap", label: "Between logos %",
        aria: "Clear distance between the S and L logos as percent of artboard width",
        hint: "clear space between S and L", value: effective.sizeGuideGapPct,
        min: SIZE_GUIDE_GAP_MIN, max: SIZE_GUIDE_GAP_MAX, step: 1, marker: marker("sizeGuideGapPct", "sizeguide-gap"),
        onCommit: (n) => update({ sizeGuideGapPct: clampSizeGuideGapPct(n) }) }} />
    </div>
  );
}

/** The percentages are measured inward from the edges the corner names. */
function insetLabel(corner: SizeGuideCorner, axis: "x" | "y"): string {
  const edge = axis === "x" ? (corner.endsWith("left") ? "left" : "right")
    : (corner.startsWith("top") ? "top" : "bottom");
  return `Distance from ${edge} edge %`;
}

function SizeGuideNumber({ field }: { field: NumberWant }) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">{field.label}{field.marker}</span>
      <DraftNumberInput testid={field.testid} label={field.aria ?? field.label} value={field.value}
        min={field.min} max={field.max} step={field.step} placeholder="mixed"
        onCommit={(n) => { if (n !== null) field.onCommit(n); }} />
      {field.hint !== undefined && <small className="up-hint">{field.hint}</small>}
    </div>
  );
}

function SizeGuideCornerField({ testid, value, onChange, marker }: {
  testid: string; value: SizeGuideCorner; onChange: (corner: string) => void; marker?: React.ReactNode;
}) {
  return (
    <div className="svg-field up-set-field">
      <label className="svg-label" htmlFor={testid}>Corner{marker}</label>
      <select id={testid} className="svg-input" data-testid={testid} aria-label="Size guide corner" value={value}
        onChange={(e) => onChange(e.target.value)}>
        {SIZE_GUIDE_CORNERS.map((corner) => <option key={corner} value={corner}>{corner.replace("-", " ")}</option>)}
      </select>
    </div>
  );
}

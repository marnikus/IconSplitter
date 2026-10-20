// UploadBadgeSettings.tsx — the supplied graphic's selected-only corner controls.
import {
  BADGE_CORNERS, BADGE_OFFSET_MAX, BADGE_OFFSET_MIN, BADGE_WIDTH_MAX, BADGE_WIDTH_MIN,
  clampBadgeOffsetPct, clampBadgeWidthPct, parseBadgeCorner,
  type BadgeCorner, type UploadSettings,
} from "../lib/upload/settings";
import DraftNumberInput from "../ui/DraftNumberInput";
import { change, changeMany, Marker, type UploadSettingsDialogProps } from "./settingsfield";

type Placement = Pick<UploadSettings, "badgeCorner" | "badgeWidthPct" | "badgeOffsetXPct" | "badgeOffsetYPct">;
interface NumberField {
  testid: string; label: string; value: number | null; min: number; max: number;
  onCommit: (n: number) => void; marker?: React.ReactNode;
}

export default function UploadBadgeSettings({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <div className="up-shadow-dialog" data-testid="upload-set-badge-section">
      {p.id === null ? <SelectedBadgeControls p={p} /> : <PerIconBadgeToggle p={p} effective={effective} />}
      {p.id === null && <small className="up-hint">Badge defaults below change size and placement, but never turn on an unchecked icon.</small>}
      <BadgePlacementFields p={p} effective={effective} selected={false} />
    </div>
  );
}

/** Selected checkbox lives in the global popup, not among global on/off defaults. */
function SelectedBadgeControls({ p }: { p: UploadSettingsDialogProps }) {
  const state = p.selectedBadge.state;
  return (
    <div className="up-shadow-controls" data-testid="upload-badge-controls">
      <div className="svg-field up-set-field">
        <span className="svg-label">Checked icons ({p.selectedCount})</span>
        <label className="up-shadow-check">
          <input type="checkbox" data-testid="upload-set-badge-selected" aria-label="Corner badge on checked icons"
            checked={state === "all"} disabled={p.selectedCount === 0} onChange={p.onSelectedBadgeToggle}
            ref={(el) => { if (el) el.indeterminate = state === "mixed"; }} />
          Badge {state === "mixed" ? "(some on)" : state === "all" ? "(all on)" : "(off)"}
        </label>
        <small className="up-hint">{p.selectedCount === 0 ? "Select icons to add a badge." : "Only checked icons, including checks hidden by a filter."}</small>
      </div>
      <BadgePlacementFields p={p} effective={p.defaults} selected />
    </div>
  );
}

function PerIconBadgeToggle({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">Corner badge<Marker p={p} field="badgeEnabled" testid="badge" /></span>
      <label className="up-shadow-check">
        <input type="checkbox" data-testid="upload-set-badge" aria-label="Corner badge on this icon"
          checked={effective.badgeEnabled} onChange={(e) => change(p, "badgeEnabled", e.target.checked)} />
        Add the supplied graphic
      </label>
      <small className="up-hint">A fixed graphic placed over the SVG in the chosen artboard corner.</small>
    </div>
  );
}

/** Both placements use the same controls, but only the selected branch writes checked rows. */
function BadgePlacementFields({ p, effective, selected }: {
  p: UploadSettingsDialogProps; effective: UploadSettings; selected: boolean;
}) {
  const badge = p.selectedBadge;
  const values = selected
    ? { width: badge.width, corner: badge.corner, x: badge.offsetX, y: badge.offsetY }
    : { width: effective.badgeWidthPct, corner: effective.badgeCorner, x: effective.badgeOffsetXPct, y: effective.badgeOffsetYPct };
  const update = (patch: Partial<Placement>) => selected ? p.onSelectedBadgePlacement(patch) : changeMany(p, patch);
  const marker = (field: keyof UploadSettings, testid: string) => <Marker p={p} field={field} testid={testid} />;
  return (
    <fieldset className="up-shadow-fields" disabled={badgeFieldsDisabled(p, effective, selected)}>
      {!selected && p.id === null && <legend className="svg-label">Badge defaults</legend>}
      <BadgeNumber field={{ testid: selected ? "upload-badge-width" : "upload-set-badge-width", label: "Badge width % of artboard",
        value: values.width, min: BADGE_WIDTH_MIN, max: BADGE_WIDTH_MAX, marker: marker("badgeWidthPct", "badge-width"),
        onCommit: (n) => update({ badgeWidthPct: clampBadgeWidthPct(n) }) }} />
      <BadgeCornerField testid={selected ? "upload-badge-corner" : "upload-set-badge-corner"} value={values.corner}
        marker={marker("badgeCorner", "badge-corner")} onChange={(v) => {
          const corner = parseBadgeCorner(v);
          if (corner !== null) update({ badgeCorner: corner });
        }} />
      <BadgeInsets p={p} selected={selected} corner={values.corner} x={values.x} y={values.y} onPatch={update} />
      <small className="up-hint" data-testid="upload-badge-fit-note">
        The badge may shrink to keep these insets inside the artboard; a 100% inset leaves no room and export reports it.
      </small>
    </fieldset>
  );
}

interface BadgeInsetsProps {
  p: UploadSettingsDialogProps;
  selected: boolean;
  corner: BadgeCorner | null;
  x: number | null;
  y: number | null;
  onPatch: (patch: Partial<Placement>) => void;
}

/** Each inset is measured from the edge named by the current corner. */
function BadgeInsets({ p, selected, corner, x, y, onPatch }: BadgeInsetsProps) {
  return <>
    <BadgeNumber field={{ testid: selected ? "upload-badge-offset-x" : "upload-set-badge-offset-x", label: insetLabel(corner, "x"),
      value: x, min: BADGE_OFFSET_MIN, max: BADGE_OFFSET_MAX, marker: <Marker p={p} field="badgeOffsetXPct" testid="badge-offset-x" />,
      onCommit: (n) => onPatch({ badgeOffsetXPct: clampBadgeOffsetPct(n) }) }} />
    <BadgeNumber field={{ testid: selected ? "upload-badge-offset-y" : "upload-set-badge-offset-y", label: insetLabel(corner, "y"),
      value: y, min: BADGE_OFFSET_MIN, max: BADGE_OFFSET_MAX, marker: <Marker p={p} field="badgeOffsetYPct" testid="badge-offset-y" />,
      onCommit: (n) => onPatch({ badgeOffsetYPct: clampBadgeOffsetPct(n) }) }} />
  </>;
}

/** The percentages are measured inward from the edges the corner names. */
function insetLabel(corner: BadgeCorner | null, axis: "x" | "y"): string {
  if (corner === null) return axis === "x" ? "Inward X % from each chosen edge" : "Inward Y % from each chosen edge";
  const edge = axis === "x" ? (corner.endsWith("left") ? "left" : "right")
    : (corner.startsWith("top") ? "top" : "bottom");
  return `Distance from ${edge} edge %`;
}

/** Editing placement never enables an off icon, whether selected or per-icon. */
function badgeFieldsDisabled(p: UploadSettingsDialogProps, effective: UploadSettings, selected: boolean): boolean {
  if (selected) return p.selectedCount === 0 || p.selectedBadge.state === "none";
  return p.id !== null && !effective.badgeEnabled;
}

function BadgeNumber({ field }: { field: NumberField }) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">{field.label}{field.marker}</span>
      <DraftNumberInput testid={field.testid} label={field.label} value={field.value}
        min={field.min} max={field.max} step={1} placeholder="mixed"
        onCommit={(n) => { if (n !== null) field.onCommit(n); }} />
    </div>
  );
}

function BadgeCornerField({ testid, value, onChange, marker }: {
  testid: string; value: BadgeCorner | null; onChange: (corner: string) => void; marker?: React.ReactNode;
}) {
  return (
    <div className="svg-field up-set-field">
      <label className="svg-label" htmlFor={testid}>Corner{marker}</label>
      <select id={testid} className="svg-input" data-testid={testid} aria-label="Badge corner" value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}>
        {value === null && <option value="" disabled>mixed corners</option>}
        {BADGE_CORNERS.map((corner) => <option key={corner} value={corner}>{corner.replace("-", " ")}</option>)}
      </select>
    </div>
  );
}

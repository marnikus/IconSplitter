import UploadSettingsGroup from "./UploadSettingsGroup";
// UploadBadgeSettings.tsx — the supplied graphic's corner controls: one placement set.
import {
  BADGE_CORNERS, BADGE_OFFSET_MAX, BADGE_OFFSET_MIN, BADGE_WIDTH_MAX, BADGE_WIDTH_MIN,
  clampBadgeOffsetPct, clampBadgeWidthPct, parseBadgeCorner,
  type BadgeCorner, type UploadSettings,
} from "../lib/upload/settings";
import UploadBadgeTemplateSetting from "./UploadBadgeTemplateSetting";
import DraftNumberInput from "../ui/DraftNumberInput";
import { change, changeMany, Marker, type UploadSettingsDialogProps } from "./settingsfield";

type Placement = Pick<UploadSettings, "badgeCorner" | "badgeWidthPct" | "badgeOffsetXPct" | "badgeOffsetYPct">;
interface NumberField {
  testid: string; label: string; value: number; min: number; max: number;
  onCommit: (n: number) => void; marker?: React.ReactNode;
}

export default function UploadBadgeSettings({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <UploadSettingsGroup name="badge" label="Badge">
      {p.id === null ? <SelectedBadgeToggle p={p} /> : <PerIconBadgeToggle p={p} effective={effective} />}
      {p.id === null && <small className="up-hint" data-testid="upload-badge-defaults-note">
        These defaults change size and placement, but never turn on an unchecked icon.
      </small>}
      <UploadBadgeTemplateSetting p={p} effective={effective} />
      <BadgePlacementFields p={p} effective={effective} />
    </UploadSettingsGroup>
  );
}

/** Selected checkbox lives in the global popup; the one placement set below is its defaults. */
function SelectedBadgeToggle({ p }: { p: UploadSettingsDialogProps }) {
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
        Add the badge graphic
      </label>
      <small className="up-hint">The selected SVG template placed over the icon in the chosen artboard corner.</small>
    </div>
  );
}

/** One placement set: global defaults in the global popup, that icon's pins in the icon popup. */
function BadgePlacementFields({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const update = (patch: Partial<Placement>) => changeMany(p, patch);
  const marker = (field: keyof UploadSettings, testid: string) => <Marker p={p} field={field} testid={testid} />;
  return (
    <fieldset className="up-shadow-fields" disabled={p.id !== null && !effective.badgeEnabled}>
      {p.id === null && <legend className="svg-label">Badge defaults</legend>}
      <BadgeNumber field={{ testid: "upload-set-badge-width", label: "Badge width % of artboard",
        value: effective.badgeWidthPct, min: BADGE_WIDTH_MIN, max: BADGE_WIDTH_MAX,
        marker: marker("badgeWidthPct", "badge-width"),
        onCommit: (n) => update({ badgeWidthPct: clampBadgeWidthPct(n) }) }} />
      <BadgeCornerField testid="upload-set-badge-corner" value={effective.badgeCorner}
        marker={marker("badgeCorner", "badge-corner")} onChange={(v) => {
          const corner = parseBadgeCorner(v);
          if (corner !== null) update({ badgeCorner: corner });
        }} />
      <BadgeInsets p={p} corner={effective.badgeCorner} x={effective.badgeOffsetXPct} y={effective.badgeOffsetYPct} onPatch={update} />
      <small className="up-hint" data-testid="upload-badge-fit-note">
        The badge may shrink to keep these insets inside the artboard; a 100% inset leaves no room and export reports it.
      </small>
    </fieldset>
  );
}

interface BadgeInsetsProps {
  p: UploadSettingsDialogProps;
  corner: BadgeCorner;
  x: number;
  y: number;
  onPatch: (patch: Partial<Placement>) => void;
}

/** Each inset is measured from the edge named by the current corner. */
function BadgeInsets({ p, corner, x, y, onPatch }: BadgeInsetsProps) {
  return <>
    <BadgeNumber field={{ testid: "upload-set-badge-offset-x", label: insetLabel(corner, "x"),
      value: x, min: BADGE_OFFSET_MIN, max: BADGE_OFFSET_MAX, marker: <Marker p={p} field="badgeOffsetXPct" testid="badge-offset-x" />,
      onCommit: (n) => onPatch({ badgeOffsetXPct: clampBadgeOffsetPct(n) }) }} />
    <BadgeNumber field={{ testid: "upload-set-badge-offset-y", label: insetLabel(corner, "y"),
      value: y, min: BADGE_OFFSET_MIN, max: BADGE_OFFSET_MAX, marker: <Marker p={p} field="badgeOffsetYPct" testid="badge-offset-y" />,
      onCommit: (n) => onPatch({ badgeOffsetYPct: clampBadgeOffsetPct(n) }) }} />
  </>;
}

/** The percentages are measured inward from the edges the corner names. */
function insetLabel(corner: BadgeCorner, axis: "x" | "y"): string {
  const edge = axis === "x" ? (corner.endsWith("left") ? "left" : "right")
    : (corner.startsWith("top") ? "top" : "bottom");
  return `Distance from ${edge} edge %`;
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
  testid: string; value: BadgeCorner; onChange: (corner: string) => void; marker?: React.ReactNode;
}) {
  return (
    <div className="svg-field up-set-field">
      <label className="svg-label" htmlFor={testid}>Corner{marker}</label>
      <select id={testid} className="svg-input" data-testid={testid} aria-label="Badge corner" value={value}
        onChange={(e) => onChange(e.target.value)}>
        {BADGE_CORNERS.map((corner) => <option key={corner} value={corner}>{corner.replace("-", " ")}</option>)}
      </select>
    </div>
  );
}

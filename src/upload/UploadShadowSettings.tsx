// UploadShadowSettings.tsx — the icon-relative gradient controls in export settings.
import {
  clampShadowGapPct, clampShadowWidthPct, SHADOW_GAP_MAX, SHADOW_GAP_MIN,
  SHADOW_WIDTH_MAX, SHADOW_WIDTH_MIN, type UploadSettings,
} from "../lib/upload/settings";
import DraftNumberInput from "../ui/DraftNumberInput";
import { change, Marker, type UploadSettingsDialogProps } from "./settingsfield";

export default function UploadShadowSettings({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  const epsWarning = p.id === null ? p.selectedShadow.epsUnsupported > 0
    : effective.shadowEnabled && effective.includeEps && effective.epsConverter === "builtin";
  return (
    <div className="up-shadow-dialog" data-testid="upload-set-shadow-section">
      {p.id === null ? <SelectedShadowControls p={p} /> : <div className="svg-field up-set-field">
        <span className="svg-label">Shadow<Marker p={p} field="shadowEnabled" testid="shadow" /></span>
        <label className="up-shadow-check">
          <input type="checkbox" data-testid="upload-set-shadow" aria-label="Shadow on this icon" checked={effective.shadowEnabled}
            onChange={(e) => change(p, "shadowEnabled", e.target.checked)} />
          the template gradient below this icon
        </label>
        <small className="up-hint">centred on the icon&apos;s painted bounds; the numbers below size it</small>
      </div>}
      <ShadowDimensions p={p} effective={effective} />
      {p.id === null && <small className="up-hint">Shadow defaults for icon settings; changing these numbers does not enable unchecked icons.</small>}
      {epsWarning &&
        <p className="svg-warning" role="alert" data-testid="upload-shadow-eps-note">
          The built-in EPS writer cannot draw gradient shadows: SVG and JPEG export, EPS reports partial. Choose Inkscape locally for EPS.
        </p>}
    </div>
  );
}

/** A selected-only checkbox, not a global default that would enable unchecked icons. */
function SelectedShadowControls({ p }: { p: UploadSettingsDialogProps }) {
  const state = p.selectedShadow.state;
  return (
    <div className="up-shadow-controls" data-testid="upload-shadow-controls">
      <div className="svg-field up-set-field">
        <span className="svg-label">Checked icons ({p.selectedCount})</span>
        <label className="up-shadow-check">
          <input type="checkbox" data-testid="upload-set-shadow-selected" aria-label="Shadow on checked icons"
            checked={state === "all"} disabled={p.selectedCount === 0} onChange={p.onSelectedShadowToggle}
            ref={(el) => { if (el) el.indeterminate = state === "mixed"; }} />
          Shadow {state === "mixed" ? "(some on)" : state === "all" ? "(all on)" : "(off)"}
        </label>
        <small className="up-hint">{p.selectedCount === 0 ? "Select icons to apply a shadow." : "Only checked icons, including checks hidden by a filter."}</small>
      </div>
      <SelectedDimensions p={p} />
    </div>
  );
}

/** Selected percentages write undoable overrides only for checked icons with Shadow on. */
function SelectedDimensions({ p }: { p: UploadSettingsDialogProps }) {
  return (
    <fieldset className="up-shadow-fields" disabled={p.selectedCount === 0 || p.selectedShadow.state === "none"}>
      <label className="svg-field up-set-field">Shadow width %
        <DraftNumberInput testid="upload-shadow-width" label="Selected shadow width as percent of icon width"
          min={SHADOW_WIDTH_MIN} max={SHADOW_WIDTH_MAX} step={1} value={p.selectedShadow.width}
          placeholder="mixed" onCommit={(n) => { if (n !== null) p.onSelectedShadowDimensions({ shadowWidthPct: clampShadowWidthPct(n) }); }} />
      </label>
      <label className="svg-field up-set-field">Gap below %
        <DraftNumberInput testid="upload-shadow-gap" label="Selected shadow gap as percent of icon height"
          min={SHADOW_GAP_MIN} max={SHADOW_GAP_MAX} step={1} value={p.selectedShadow.gap}
          placeholder="mixed" onCommit={(n) => { if (n !== null) p.onSelectedShadowDimensions({ shadowGapPct: clampShadowGapPct(n) }); }} />
      </label>
    </fieldset>
  );
}

function ShadowDimensions({ p, effective }: { p: UploadSettingsDialogProps; effective: UploadSettings }) {
  return (
    <fieldset className="up-shadow-fields" disabled={p.id !== null && !effective.shadowEnabled}>
      {p.id === null && <legend className="svg-label">Shadow defaults</legend>}
      <label className="svg-field up-set-field">
        <span className="svg-label">Shadow width %<Marker p={p} field="shadowWidthPct" testid="shadow-width" /></span>
        <DraftNumberInput testid="upload-set-shadow-width" label="Shadow width as percent of icon width"
          min={SHADOW_WIDTH_MIN} max={SHADOW_WIDTH_MAX} step={1} value={effective.shadowWidthPct}
          onCommit={(n) => { if (n !== null) change(p, "shadowWidthPct", clampShadowWidthPct(n)); }} />
        <small className="up-hint">% of the painted icon width, template aspect ratio preserved</small>
      </label>
      <label className="svg-field up-set-field">
        <span className="svg-label">Gap below %<Marker p={p} field="shadowGapPct" testid="shadow-gap" /></span>
        <DraftNumberInput testid="upload-set-shadow-gap" label="Clear gap below icon as percent of its height"
          min={SHADOW_GAP_MIN} max={SHADOW_GAP_MAX} step={1} value={effective.shadowGapPct}
          onCommit={(n) => { if (n !== null) change(p, "shadowGapPct", clampShadowGapPct(n)); }} />
        <small className="up-hint">% of the painted icon height below its bottom edge</small>
      </label>
    </fieldset>
  );
}

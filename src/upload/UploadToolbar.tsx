// UploadToolbar.tsx — selection, preview background, thumbnail zoom and the bulk
// actions (prompt §3/§4). Owns the controls whose value is the SELECTION and the
// VIEW; every rule behind them (status, counts, overrides) is in a tested module.
//
// Bulk settings are applied as one action with the affected count reported, and
// the same action is what the undo history reverses — there is no second path.

import { DEFAULT_UPLOAD_SETTINGS } from "../lib/uploadsettings";
import { settingsSummary } from "../lib/uploadsettings";
import { PREVIEW_BACKGROUNDS } from "./previews";
import type { UploadApi } from "./useUpload";

export default function UploadToolbar({ api }: { api: UploadApi }) {
  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-white/10 py-3" aria-label="Selection, export settings and preview">
      <Selection api={api} />
      <SettingsBar api={api} />
      <PreviewBackground api={api} />
      <Zoom api={api} />
      <RunButtons api={api} />
    </section>
  );
}

function Selection({ api }: { api: UploadApi }) {
  return (
    <>
      <div className="text-[11px] text-slate-200">
        <b>{api.checked.length} selected</b>{" "}
        <span className="text-[10px] text-slate-400">/ across {api.rows.length} approved SVGs</span>
      </div>
      <button type="button" className="btn-ghost" data-testid="upload-select-visible" onClick={() => api.checkVisible(true)}>Select all visible</button>
      <button type="button" className="btn-ghost" data-testid="upload-deselect" onClick={() => api.checkVisible(false)}>Deselect all</button>
    </>
  );
}

/** Global defaults, the per-icon override and the way between the two. */
function SettingsBar({ api }: { api: UploadApi }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" aria-label="Export settings">
      <span className="text-[9px] font-semibold tracking-widest text-slate-400">EXPORT</span>
      <Numbers api={api} />
      <Toggles api={api} />
      <SettingsButtons api={api} />
    </div>
  );
}

function Numbers({ api }: { api: UploadApi }) {
  const s = api.settings;
  return (
    <>
      <NumberBox label="Padding %" value={s.paddingPct} testid="upload-padding" min={0} max={40} step={1}
        onChange={(value) => api.updateSettings({ paddingPct: value })} />
      <NumberBox label="Scale %" value={s.iconScalePct} testid="upload-scale" min={10} max={100} step={1}
        onChange={(value) => api.updateSettings({ iconScalePct: value })} />
      <NumberBox label="MP" value={s.targetMP} testid="upload-mp" min={0.1} max={60} step={0.1}
        onChange={(value) => api.updateSettings({ targetMP: value })} />
      <label className="flex items-center gap-1 text-[10px] text-slate-400">Background
        <input type="color" value={s.background} data-testid="upload-background"
          className="h-5 w-8 rounded border border-white/20 bg-slate-900"
          onChange={(event) => api.updateSettings({ background: event.target.value })} />
      </label>
    </>
  );
}

function Toggles({ api }: { api: UploadApi }) {
  const s = api.settings;
  return (
    <>
      <Toggle label="plate in SVG" checked={s.backgroundInSvg} testid="upload-bg-svg" onChange={(on) => api.updateSettings({ backgroundInSvg: on })} />
      <Toggle label="Optimize SVG" checked={s.optimizeSvg} testid="upload-optimize" onChange={(on) => api.updateSettings({ optimizeSvg: on })} />
      <Toggle label="EPS" checked={s.includeEps} testid="upload-eps" onChange={(on) => api.updateSettings({ includeEps: on })} />
    </>
  );
}

function SettingsButtons({ api }: { api: UploadApi }) {
  return (
    <>
      <span className="text-[10px] text-slate-400" data-testid="upload-settings-summary">{settingsSummary(api.settings)}</span>
      <button type="button" className="btn-ghost" data-testid="upload-apply-settings" disabled={api.checked.length === 0}
        title="Apply the current values as overrides on the selected icons — one undoable action"
        onClick={() => api.applyToSelection({ ...api.settings })}>
        Apply to selected
      </button>
      <button type="button" className="btn-ghost" data-testid="upload-reset-settings" onClick={() => api.resetSettings()}>Reset defaults</button>
      <span className="text-[9px] text-slate-500">
        defaults: {DEFAULT_UPLOAD_SETTINGS.targetMP} MP · {DEFAULT_UPLOAD_SETTINGS.strokeWidth} {DEFAULT_UPLOAD_SETTINGS.strokeUnit}
      </span>
    </>
  );
}

const BOX = "w-16 rounded border border-white/10 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-100";

function NumberBox({ label, value, testid, min, max, step, onChange }: {
  label: string; value: number; testid: string; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-slate-400">{label}
      <input className={BOX} type="number" min={min} max={max} step={step} value={value} data-testid={testid}
        onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, testid, onChange }: { label: string; checked: boolean; testid: string; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <input type="checkbox" checked={checked} data-testid={testid} onChange={(event) => onChange(event.target.checked)} /> {label}
    </label>
  );
}

function RunButtons({ api }: { api: UploadApi }) {
  const blocked = !api.supported || api.busy || api.checked.length === 0 || api.preflight.blockers.length > 0;
  const ids = api.checked.map((row) => row.id);
  return (
    <>
      <button type="button" className="btn-primary" data-testid="upload-generate" disabled={blocked}
        title="One paid request per selected icon that has no accepted metadata" onClick={() => void api.generate(ids)}>
        Generate metadata
      </button>
      <button type="button" className="btn-primary" data-testid="upload-export" disabled={blocked} onClick={() => void api.exportRows(ids)}>
        Export selected
      </button>
      {api.busy && <button type="button" className="btn-ghost" data-testid="upload-cancel" onClick={api.cancel}>Cancel run</button>}
    </>
  );
}

function PreviewBackground({ api }: { api: UploadApi }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold tracking-widest text-slate-400">PREVIEW BG</span>
      {PREVIEW_BACKGROUNDS.map((bg) => (
        <button
          key={bg.label} type="button" className="h-4 w-4 rounded border border-white/40" aria-label={`${bg.label} background`}
          aria-pressed={api.previewBackground === bg.value} style={{ background: bg.value }}
          data-testid={`upload-bg-${bg.label.toLowerCase()}`} onClick={() => api.setPreviewBackground(bg.value)}
        />
      ))}
    </div>
  );
}

function Zoom({ api }: { api: UploadApi }) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <label htmlFor="upload-zoom" className="text-[9px] font-semibold tracking-widest text-slate-400">ZOOM THUMBNAILS</label>
      <span className="text-[9px] text-slate-500">48</span>
      <input id="upload-zoom" type="range" min={48} max={440} value={api.zoom} data-testid="upload-zoom"
        onChange={(event) => api.setZoom(Number(event.target.value))} />
      <span className="text-[9px] text-slate-500">440</span>
      <output className="text-[10px] text-slate-300">{api.zoom}px</output>
    </div>
  );
}

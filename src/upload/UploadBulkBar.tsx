// UploadBulkBar.tsx — the bulk bar of the "SVG to upload" tab (design §4.1/
// §6): the header checkbox with an indeterminate state, the selection scope,
// the two PREVIEW settings (thumbnail zoom and the frame background — one
// control per decision, RULE 10), the live progress line, and the four bulk
// actions: Apply settings to selected (ONE undoable entry), Metadata selected
// (confirmed against the exact request first), Export selected, and Cancel
// while a run is in flight. Every bulk action applies to the SELECTION only.

import { BG_PRESETS, backgroundLabel, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";

export interface UploadBulkBarProps {
  header: "none" | "some" | "all";
  checkedCount: number;
  visibleCount: number;
  thumb: number;
  bg: PreviewBackground;
  progress: { done: number; total: number } | null;
  runningMeta: number;
  runningExport: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onBg: (bg: PreviewBackground) => void;
  onApplySettings: () => void;
  onMetadata: () => void;
  onExport: () => void;
  onCancel: () => void;
}

export default function UploadBulkBar(p: UploadBulkBarProps) {
  return (
    <div className="svg-bulk" data-testid="upload-bulk">
      <BulkLeft p={p} />
      <BulkRight p={p} />
    </div>
  );
}

/** The selection half: header checkbox, counts, scope, select/deselect. */
function BulkLeft({ p }: { p: UploadBulkBarProps }) {
  return (
    <div className="svg-bulk-left">
      <input type="checkbox" data-testid="upload-check-all" aria-label="Select all visible icons"
        checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)}
        ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
      <span className="svg-selected-copy" data-testid="upload-selected-count">{p.checkedCount} selected</span>
      <span className="svg-scope-copy" data-testid="upload-scope">across {p.visibleCount} approved SVGs</span>
      <span className="svg-divider" aria-hidden="true" />
      <button type="button" className="svg-btn" data-testid="upload-select-visible" onClick={p.onSelectVisible}>Select all visible</button>
      <button type="button" className="svg-btn" data-testid="upload-deselect" onClick={p.onDeselectAll}>Deselect all</button>
    </div>
  );
}

/** The action half: preview settings, progress, cancel, the four bulk actions. */
function BulkRight({ p }: { p: UploadBulkBarProps }) {
  const running = p.runningMeta + p.runningExport;
  return (
    <div className="svg-bulk-right">
      <PreviewBg bg={p.bg} onBg={p.onBg} />
      <span className="svg-divider" aria-hidden="true" />
      <Zoom thumb={p.thumb} onThumb={p.onThumb} />
      <span className="svg-divider" aria-hidden="true" />
      <Progress p={p} running={running} />
      {running > 0 && (
        <button type="button" className="svg-btn" data-testid="upload-cancel-run" onClick={p.onCancel}>Cancel run</button>
      )}
      <button type="button" className="svg-btn" data-testid="upload-apply-settings"
        disabled={p.checkedCount === 0} onClick={p.onApplySettings}>Apply settings to selected</button>
      <button type="button" className="svg-btn" data-testid="upload-meta-selected"
        disabled={p.checkedCount === 0} onClick={p.onMetadata}>✦ Metadata selected</button>
      <button type="button" className="svg-btn primary" data-testid="upload-export-selected"
        disabled={p.checkedCount === 0} onClick={p.onExport}>⇪ Export selected</button>
    </div>
  );
}

/** The ONE zoom value (display-only — never the output scale, design §2.12). */
function Zoom({ thumb, onThumb }: { thumb: number; onThumb: (px: number) => void }) {
  return (
    <div className="svg-zoom">
      <label htmlFor="upload-thumb">ZOOM</label>
      <span aria-hidden="true">{ZOOM_MIN}</span>
      <input id="upload-thumb" data-testid="upload-thumb" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={thumb} aria-label="Thumbnail maximum height"
        onChange={(e) => onThumb(clampZoom(Number(e.target.value)))} />
      <span aria-hidden="true">{ZOOM_MAX}</span>
      <output className="svg-zoom-value" data-testid="upload-thumb-value" htmlFor="upload-thumb">{zoomLabel(thumb)}</output>
    </div>
  );
}

/** The live progress line while a run is in flight, the selection line otherwise. */
function Progress({ p, running }: { p: UploadBulkBarProps; running: number }) {
  if (p.progress === null || running === 0) {
    return (
      <div className="svg-estimate" data-testid="upload-estimate">
        <strong>{p.checkedCount} icon{p.checkedCount === 1 ? "" : "s"} selected</strong>
        <span>packages commit into each pair's export folder · the approved source is never touched</span>
      </div>
    );
  }
  const kind = p.runningMeta > 0 ? "metadata" : "export";
  return (
    <div className="svg-estimate" data-testid="upload-estimate">
      <strong>{kind} {p.progress.done}/{p.progress.total}</strong>
      <span data-testid="upload-progress">{kind} run in flight — finished results are kept</span>
    </div>
  );
}

/** Presets + one custom colour = ONE decision: the preview frame background. */
function PreviewBg({ bg, onBg }: { bg: PreviewBackground; onBg: (bg: PreviewBackground) => void }) {
  return (
    <div className="svg-bg" data-testid="upload-bg">
      <label htmlFor="upload-bg-custom">PREVIEW BG</label>
      {BG_PRESETS.map((preset) => (
        <button key={preset.id} type="button" className={`svg-swatch${bg.preset === preset.id ? " on" : ""}`}
          data-testid={`upload-bg-${preset.id}`} title={`Preview background: ${preset.label}`}
          aria-label={`Preview background ${preset.label}`} aria-pressed={bg.preset === preset.id}
          style={{ background: preset.color }} onClick={() => onBg(selectPreset(bg, preset.id))} />
      ))}
      <input id="upload-bg-custom" data-testid="upload-bg-custom" type="color" value={bg.custom}
        aria-label="Custom preview background" onChange={(e) => onBg(selectCustom(bg, e.target.value))} />
      <output className="svg-bg-value" data-testid="upload-bg-value" htmlFor="upload-bg-custom"
        title="Preview only — saved SVG files are never changed">{backgroundLabel(bg)}</output>
    </div>
  );
}

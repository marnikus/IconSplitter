// SvgBulkBar.tsx — the bulk bar of the Generate SVG tab (prompt §2/§15/§16/§17).
// Header checkbox with an indeterminate state, the selected/visible scope,
// select-visible and deselect-all, the two PREVIEW settings (thumbnail zoom and
// the frame background — one control per decision, RULE 10), the estimate line,
// and the three bulk actions: Generate, Approve, Decline. There is no "approve
// visible" action — every bulk operation applies to the SELECTION only, and
// Approve/Decline stay disabled until a selected row has a valid SVG. While a
// run is in flight the bar shows the live batch progress and a Cancel that
// keeps everything already saved.

import { BG_PRESETS, backgroundLabel, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";
import { costText, fmtTokens } from "../lib/svgusage";
import Elapsed from "./Elapsed";
import type { RunProgress } from "./types";

export interface SvgBulkBarProps {
  header: "none" | "some" | "all";
  checkedCount: number;
  /** Requests the selection becomes at the effective per-request size. */
  requestCount: number;
  visibleCount: number;
  decidableCount: number;
  thumb: number;
  bg: PreviewBackground;
  model: string;
  totals: { tokens: number | null; cost: number | null; estimated: number | null };
  progress: RunProgress | null;
  running: boolean;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onBg: (bg: PreviewBackground) => void;
  onGenerate: () => void;
  onDecide: (decision: "approved" | "declined") => void;
  onCancel: () => void;
}

export default function SvgBulkBar(p: SvgBulkBarProps) {
  return (
    <div className="svg-bulk" data-testid="svg-bulk">
      <BulkLeft p={p} />
      <BulkRight p={p} />
    </div>
  );
}

function BulkLeft({ p }: { p: SvgBulkBarProps }) {
  return (
      <div className="svg-bulk-left">
        <input type="checkbox" data-testid="svg-check-all" aria-label="Select all visible sources"
          checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)}
          ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
        <span className="svg-selected-copy" data-testid="svg-selected-count">{p.checkedCount} selected</span>
        <span className="svg-scope-copy" data-testid="svg-scope">across {p.visibleCount} approved sources</span>
        <span className="svg-divider" aria-hidden="true" />
        <button type="button" className="svg-btn" data-testid="svg-select-visible" onClick={p.onSelectVisible}>Select all visible</button>
        <button type="button" className="svg-btn" data-testid="svg-deselect" onClick={p.onDeselectAll}>Deselect all</button>
      </div>
  );
}

function BulkRight({ p }: { p: SvgBulkBarProps }) {
  return (
      <div className="svg-bulk-right">
        <PreviewBg bg={p.bg} onBg={p.onBg} />
        <span className="svg-divider" aria-hidden="true" />
        <div className="svg-zoom">
          <label htmlFor="svg-thumb">ZOOM</label>
          <span aria-hidden="true">{ZOOM_MIN}</span>
          <input id="svg-thumb" data-testid="svg-thumb" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
            value={p.thumb} aria-label="Thumbnail maximum height"
            onChange={(e) => p.onThumb(clampZoom(Number(e.target.value)))} />
          <span aria-hidden="true">{ZOOM_MAX}</span>
          <output className="svg-zoom-value" data-testid="svg-thumb-value" htmlFor="svg-thumb">{zoomLabel(p.thumb)}</output>
        </div>
        <span className="svg-divider" aria-hidden="true" />
        <Estimate p={p} />
        {p.running && (
          <button type="button" className="svg-btn" data-testid="svg-cancel-run" onClick={p.onCancel}>Cancel run</button>
        )}
        <button type="button" className="svg-btn primary" data-testid="svg-generate-selected"
          disabled={p.checkedCount === 0} onClick={p.onGenerate}>✦ Generate selected</button>
        <button type="button" className="svg-btn success" data-testid="svg-approve-selected"
          disabled={p.decidableCount === 0} onClick={() => p.onDecide("approved")}>✓ Approve selected</button>
        <button type="button" className="svg-btn danger" data-testid="svg-decline-selected"
          disabled={p.decidableCount === 0} onClick={() => p.onDecide("declined")}>✕ Decline selected</button>
      </div>
  );
}

/** The estimate line doubles as the live batch counter while a run is in flight. */
function Estimate({ p }: { p: SvgBulkBarProps }) {
  const cost = costText({ reported: p.totals.cost, estimated: p.totals.estimated });
  return (
    <div className="svg-estimate" data-testid="svg-estimate">
      <strong>{p.checkedCount} images · {p.requestCount} request(s) · {p.model}</strong>
      {p.progress === null
        ? <span>visible usage {fmtTokens(p.totals.tokens)} tokens · {cost}</span>
        : <span data-testid="svg-batch-progress">request {p.progress.index}/{p.progress.batches} · {p.progress.saved} saved · {p.progress.failed} failed · {p.progress.missing} missing · <Elapsed startedAt={p.progress.startedAt} running={p.running} testid="svg-bulk-elapsed" /></span>}
    </div>
  );
}

/** Presets + one custom colour = ONE decision: the preview frame background. */
function PreviewBg({ bg, onBg }: { bg: PreviewBackground; onBg: (bg: PreviewBackground) => void }) {
  return (
    <div className="svg-bg" data-testid="svg-bg">
      <label htmlFor="svg-bg-custom">PREVIEW BG</label>
      {BG_PRESETS.map((preset) => (
        <button key={preset.id} type="button" className={`svg-swatch${bg.preset === preset.id ? " on" : ""}`}
          data-testid={`svg-bg-${preset.id}`} title={`Preview background: ${preset.label}`}
          aria-label={`Preview background ${preset.label}`} aria-pressed={bg.preset === preset.id}
          style={{ background: preset.color }} onClick={() => onBg(selectPreset(bg, preset.id))} />
      ))}
      <input id="svg-bg-custom" data-testid="svg-bg-custom" type="color" value={bg.custom}
        aria-label="Custom preview background" onChange={(e) => onBg(selectCustom(bg, e.target.value))} />
      <output className="svg-bg-value" data-testid="svg-bg-value" htmlFor="svg-bg-custom"
        title="Preview only — saved SVG files and their code are never changed">{backgroundLabel(bg)}</output>
    </div>
  );
}

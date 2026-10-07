// UploadBulk.tsx — the bar above the list (design §2/§5). Split into four small
// pieces so every rule stays readable: the SCOPE (select all visible, clear),
// the list CONTROLS (search, filter, sort), the ONE zoom (display only — the
// request is explicit that it never becomes an output scale) and the ACTIONS
// that write settings (Apply = one undoable bulk edit; Reset = drop overrides).
// Nothing here exports yet; that arrives with the pipeline phases.

import { BG_PRESETS, type PreviewBackground } from "../lib/svgbackground";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";
import type { UploadCounts, UploadOnly, UploadSort, UploadView } from "../lib/svgupload/view";
import { pickBackground } from "./UploadControls";

export interface UploadBulkProps {
  counts: UploadCounts;
  checkedCount: number;
  view: UploadView;
  zoom: number;
  background: PreviewBackground;
  busy: boolean;
  onView: (view: UploadView) => void;
  onZoom: (px: number) => void;
  onBackground: (bg: PreviewBackground) => void;
  onToggleAll: (on: boolean) => void;
  onApply: () => void;
  onReset: () => void;
  /** The bulk jobs: name, export, retry and cancel what is running. */
  jobs: BulkJobs;
}

export interface BulkJobs {
  /** The icons the four bulk actions apply to (visible ∩ selected). */
  onGenerate: () => void;
  onExport: () => void;
  onRetry: () => void;
  onCancel: () => void;
  running: boolean;
  failed: number;
}

export default function UploadBulk(p: UploadBulkProps) {
  return (
    <section className="svg-toolbar" data-testid="up-bulk" aria-label="Selection and view">
      <Scope p={p} />
      <ListControls p={p} />
      <Zoom p={p} />
      <Actions p={p} />
      <JobActions p={p} />
    </section>
  );
}

/** The header checkbox plus the four counters — the counts come off the rows. */
function Scope({ p }: { p: UploadBulkProps }) {
  const { counts, checkedCount } = p;
  return (
    <label className="up-head">
      <input type="checkbox" data-testid="up-check-all" aria-label="Select all visible icons"
        checked={counts.icons > 0 && checkedCount === counts.icons}
        ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && checkedCount < counts.icons; }}
        onChange={(e) => p.onToggleAll(e.target.checked)} />
      <span className="svg-summary" data-testid="up-counts">
        <Chip testid="up-count-icons" text="icons" n={counts.icons} />
        <Chip testid="up-count-eligible" text="eligible" n={counts.eligible} />
        <Chip testid="up-count-awaiting" text="awaiting metadata" n={counts.awaitingMeta} />
        <Chip testid="up-count-ready" text="ready" n={counts.ready} tone="approved" />
        <Chip testid="up-count-processing" text="processing" n={counts.processing} />
        <Chip testid="up-count-processed" text="processed" n={counts.processed} tone="approved" />
        <Chip testid="up-count-stale" text="stale" n={counts.stale} />
        <Chip testid="up-count-failed" text="failed" n={counts.failed} tone="failed" />
        <Chip testid="up-count-blocked" text="blocked" n={counts.blocked} tone="failed" />
        <Chip testid="up-count-warned" text="warnings" n={counts.warned} />
      </span>
    </label>
  );
}

function Chip({ testid, text, n, tone = "" }: { testid: string; text: string; n: number; tone?: string }) {
  return <span className={`svg-chip${tone === "" ? "" : ` ${tone}`}`} data-testid={testid}><strong>{n}</strong> {text}</span>;
}

/** Search, the problem filter and the sort — the list reads all three. */
function ListControls({ p }: { p: UploadBulkProps }) {
  return (
    <div className="svg-filters">
      <input className="svg-input" data-testid="up-search" type="search" placeholder="Search icon or folder"
        value={p.view.search} onChange={(e) => p.onView({ ...p.view, search: e.target.value })} />
      <select className="svg-input" data-testid="up-only" aria-label="Filter rows" value={p.view.only}
        onChange={(e) => p.onView({ ...p.view, only: e.target.value as UploadOnly })}>
        <option value="all">All</option>
        <option value="ready">Ready</option>
        <option value="warnings">Warnings</option>
        <option value="blocked">Blocked</option>
      </select>
      <select className="svg-input" data-testid="up-sort" aria-label="Sort rows" value={p.view.sort}
        onChange={(e) => p.onView({ ...p.view, sort: e.target.value as UploadSort })}>
        <option value="path">Sort: path</option>
        <option value="name">Sort: name</option>
        <option value="version">Sort: version</option>
        <option value="state">Sort: state</option>
      </select>
    </div>
  );
}

function Zoom({ p }: { p: UploadBulkProps }) {
  return (
    <div className="svg-zoom">
      <label htmlFor="up-thumb">ZOOM</label>
      <input id="up-thumb" data-testid="up-thumb" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={p.zoom} aria-label="Thumbnail maximum height" onChange={(e) => p.onZoom(clampZoom(Number(e.target.value)))} />
      <output className="svg-zoom-value" data-testid="up-thumb-value" htmlFor="up-thumb">{zoomLabel(p.zoom)}</output>
    </div>
  );
}

/**
 * The bulk jobs, in the order the work happens: name the selection, export it,
 * retry what failed, or stop what is still going. Cancelling keeps the packages
 * that already committed — the button says so when the cursor rests on it.
 */
function JobActions({ p }: { p: UploadBulkProps }) {
  const idle = p.busy || p.checkedCount === 0;
  return (
    <div className="svg-filters">
      <button className="svg-btn" data-testid="up-generate-selected" disabled={idle} onClick={p.jobs.onGenerate}>
        Generate metadata for {p.checkedCount}
      </button>
      <button className="svg-btn primary" data-testid="up-export-selected" disabled={idle} onClick={p.jobs.onExport}>
        Export selected
      </button>
      <button className="svg-btn" data-testid="up-retry-failed" disabled={p.busy || p.jobs.failed === 0} onClick={p.jobs.onRetry}>
        Retry failed ({p.jobs.failed})
      </button>
      <button className="svg-btn ghost" data-testid="up-cancel" disabled={!p.jobs.running} onClick={p.jobs.onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** The preview frame's colour (never a document change) and the two writers. */
function Actions({ p }: { p: UploadBulkProps }) {
  return (
    <div className="svg-filters">
      <select className="svg-input" data-testid="up-preview-bg" aria-label="Preview background" value={p.background.preset}
        onChange={(e) => p.onBackground(pickBackground(p.background, e.target.value))}>
        {BG_PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        <option value="custom">Custom</option>
      </select>
      <button className="svg-btn primary" data-testid="up-apply" disabled={p.busy || p.checkedCount === 0} onClick={p.onApply}>
        Apply to {p.checkedCount} selected
      </button>
      <button className="svg-btn" data-testid="up-reset-selected" disabled={p.busy || p.checkedCount === 0} onClick={p.onReset}>
        Reset to defaults
      </button>
    </div>
  );
}

// ui/SvgBulkToolbar.tsx — Selection-V2-style checks, selected-only actions,
// undoable thumbnail zoom, bounded queue progress and safe cancellation.

import { useEffect, useState } from "react";
import type { SvgPreferences } from "../prefs";
import type { SvgReviewDecision, SvgSourceRow } from "../types";
import type { SvgPreferencePatch } from "./useSvgPreferences";
import type { QueueProgress } from "../run/queue";

interface SvgBulkToolbarProps {
  rows: SvgSourceRow[];
  selected: SvgSourceRow[];
  selectedCount: number;
  hiddenCount: number;
  prefs: SvgPreferences;
  progress: QueueProgress;
  running: boolean;
  preparing: boolean;
  stage: string;
  edit: (patch: SvgPreferencePatch, label: string, gesture?: boolean) => boolean;
  setChecked: (ids: string[], on: boolean) => void;
  clearChecked: () => void;
  onGenerate: (rows: SvgSourceRow[]) => void;
  onReview: (rows: SvgSourceRow[], decision: SvgReviewDecision) => void;
  onCancel: () => void;
}

export default function SvgBulkToolbar(p: SvgBulkToolbarProps) {
  const [armed, setArmed] = useState<SvgReviewDecision | null>(null);
  useEscape(() => setArmed(null), armed !== null);
  const selectedVisible = p.rows.filter((row) => p.selected.some((item) => item.pairId === row.pairId));
  const reviewable = selectedVisible.filter((row) => Boolean(row.newestSvg) && row.sidecarState === "ok" && !isRunningRow(row));
  const generatable = selectedVisible.filter((row) => canGenerate(row));
  return (
    <section className="svg-bulk" aria-label="Selected SVG actions">
      <SelectionControls p={p} selected={selectedVisible.length} />
      <ZoomControl prefs={p.prefs} edit={p.edit} />
      <QueueProgressBar progress={p.progress} stage={p.stage} />
      <BulkActionButtons p={p} generatable={generatable} reviewable={reviewable}
        armed={armed} setArmed={setArmed} />
    </section>
  );
}

interface BulkActionsProps {
  p: SvgBulkToolbarProps; generatable: SvgSourceRow[]; reviewable: SvgSourceRow[];
  armed: SvgReviewDecision | null; setArmed: (decision: SvgReviewDecision | null) => void;
}

function BulkActionButtons({ p, generatable, reviewable, armed, setArmed }: BulkActionsProps) {
  return <div className="svg-bulk-actions">
    {p.running && <button type="button" className="svg-btn danger" onClick={p.onCancel}>Stop after current request</button>}
    <button type="button" className="svg-btn primary" disabled={generatable.length === 0 || p.preparing || p.running}
      onClick={() => p.onGenerate(generatable)}>{p.preparing ? "Preparing…" : `Generate selected (${generatable.length})`}</button>
    <ReviewButton decision="approved" count={reviewable.length} armed={armed} setArmed={setArmed} onRun={() => p.onReview(reviewable, "approved")} />
    <ReviewButton decision="declined" count={reviewable.length} armed={armed} setArmed={setArmed} onRun={() => p.onReview(reviewable, "declined")} />
    <ReviewButton decision="pending" count={reviewable.length} armed={armed} setArmed={setArmed} onRun={() => p.onReview(reviewable, "pending")} />
  </div>;
}

function SelectionControls({ p, selected }: { p: SvgBulkToolbarProps; selected: number }) {
  const state = p.rows.length === 0 || selected === 0 ? "none" : selected === p.rows.length ? "all" : "some";
  return (
    <div className="svg-selection-tools">
      <input type="checkbox" aria-label="Select all visible approved sources" checked={state === "all"}
        ref={(element) => { if (element) element.indeterminate = state === "some"; }}
        onChange={(event) => p.setChecked(p.rows.map((row) => row.pairId), event.target.checked)} />
      <strong>{p.selectedCount} selected</strong><span>{selected} visible and actionable</span>
      {p.hiddenCount > 0 && <span className="svg-warning-copy">{p.hiddenCount} selected but hidden by filters</span>}
      <button type="button" className="svg-btn" onClick={() => p.setChecked(p.rows.map((row) => row.pairId), true)}>Select visible</button>
      <button type="button" className="svg-btn" onClick={p.clearChecked}>Deselect all</button>
    </div>
  );
}

function ZoomControl({ prefs, edit }: { prefs: SvgPreferences; edit: SvgBulkToolbarProps["edit"] }) {
  return (
    <label className="svg-zoom"><span>Thumbnail zoom</span><input type="range" min="48" max="180" step="4" value={prefs.thumbHeight}
      onChange={(event) => edit({ thumbHeight: Number(event.target.value) }, "SVG thumbnail zoom", true)} />
      <output>{prefs.thumbHeight} px</output></label>
  );
}

function QueueProgressBar({ progress, stage }: { progress: QueueProgress; stage: string }) {
  const percent = progress.total ? Math.round(progress.completed / progress.total * 100) : 0;
  return (
    <div className="svg-queue-progress" aria-live="polite">
      <span>{progress.total ? `${progress.completed} / ${progress.total} batches · ${progress.active} active` : "Ready"}</span>
      <div className="svg-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Generation batch progress">
        <span style={{ width: `${percent}%` }} />
      </div><small>{stage}</small>
    </div>
  );
}

function ReviewButton({ decision, count, armed, setArmed, onRun }: {
  decision: SvgReviewDecision; count: number; armed: SvgReviewDecision | null;
  setArmed: (decision: SvgReviewDecision | null) => void; onRun: () => void;
}) {
  const active = armed === decision;
  const label = decision === "pending" ? "Reset to pending" : titleCase(decision);
  return (
    <button type="button" className={`svg-btn ${decision === "approved" ? "success" : decision === "declined" ? "danger" : ""}`}
      disabled={count === 0} onClick={() => runReviewButton(active, decision, setArmed, onRun)}>
      {active ? `Confirm ${label.toLowerCase()} ${count}?` : `${label} selected (${count})`}
    </button>
  );
}

function runReviewButton(active: boolean, decision: SvgReviewDecision, setArmed: (value: SvgReviewDecision | null) => void, run: () => void): void {
  if (!active) { setArmed(decision); return; }
  setArmed(null); run();
}

function useEscape(onEscape: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onEscape(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, onEscape]);
}

function canGenerate(row: SvgSourceRow): boolean {
  const hasOrphanOutput = row.versions.length > 0 || Boolean(row.recoverableTempPath);
  return !row.recoverableTempPath && !["generating", "unknown", "corrupt"].includes(row.generation)
    && (row.sidecarState === "ok" || !hasOrphanOutput);
}

function isRunningRow(row: SvgSourceRow): boolean {
  return row.generation === "generating";
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

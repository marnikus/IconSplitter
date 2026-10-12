// BatchProgressHeader.tsx — persistent progress bar for batch split, same as Generate SVG bar
// Portalled to #batch-progress-mount so it stays visible when switching tabs

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { batchTotals, type BatchProgress } from "./BatchProgress";
import type { Row } from "./useBatchTypes";

interface Props {
  progress: BatchProgress | null;
  running: boolean;
  rows: Row[];
  thumbFor: (relPath: string) => Promise<string>;
  onCancel: () => void;
  onDismiss: () => void;
  onReview: () => void;
}

export default function BatchProgressHeader(p: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const runId = p.progress?.runId ?? null;
  const shouldShow = p.progress !== null && runId !== dismissed;

  useEffect(() => {
    if (runId && dismissed && runId !== dismissed) setDismissed(null);
  }, [runId, dismissed]);

  if (!shouldShow || !p.progress) return null;

  const mount = document.getElementById("batch-progress-mount");
  const content = (
    <>
      <Bar {...p} onCancelClick={() => setShowCancel(true)} onDismiss={() => { setDismissed(runId); p.onDismiss(); }} onReview={p.onReview} />
      {showCancel && <CancelDialog {...p} onKeep={() => setShowCancel(false)} onConfirm={() => { setShowCancel(false); p.onCancel(); }} />}
    </>
  );

  return mount ? createPortal(content, mount) : content;
}

function Bar(props: Props & { onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  return props.running ? <RunningBar {...props} /> : <CompleteBar {...props} />;
}

function useCurrent(props: Props) {
  const { progress, rows } = props;
  if (!progress) return { totals: null, currentRow: null, done: 0, left: 0, percent: 0, total: 0 };
  const totals = batchTotals(progress);
  const currentRow = progress.currentRelPath ? rows.find((r) => r.relPath === progress.currentRelPath) ?? null : null;
  return { totals, currentRow, done: totals.done, left: totals.left, percent: totals.percent, total: progress.total };
}

function RunningBar(props: Props & { onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const { done, left, percent, total, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number };
  const currentName = props.progress?.currentName ?? currentRow?.name ?? "";
  return (
    <div className="batch-progress-header" data-testid="batch-progress-header">
      <div className="batch-progress-left">
        <ProgressThumb thumbFor={props.thumbFor} relPath={props.progress?.currentRelPath ?? null} name={currentName} />
        <div className="batch-progress-text">
          <strong data-testid="batch-progress-title">Splitting icons · {total} files</strong>
          <span className="batch-progress-file" data-testid="batch-progress-file" title={currentName}>{currentName}</span>
        </div>
      </div>
      <div className="batch-progress-center">
        <Track percent={percent} testid="batch-progress-track" />
        <div className="batch-progress-stats">
          <span data-testid="batch-progress-completed">{done} completed / {total}</span>
          <span data-testid="batch-progress-remaining">{left} remaining</span>
        </div>
      </div>
      <div className="batch-progress-right">
        <span className="batch-progress-percent" data-testid="batch-progress-percent">{percent}%</span>
        <button type="button" className="svg-btn tiny" data-testid="batch-progress-cancel" onClick={props.onCancelClick}>✕ Cancel batch</button>
      </div>
    </div>
  );
}

function CompleteBar(props: Props & { onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const { done, total } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number; total: number };
  const saved = props.progress?.saved ?? done;
  return (
    <div className="batch-progress-header complete" data-testid="batch-progress-header">
      <div className="batch-progress-left">
        <span className="batch-progress-check" aria-hidden="true">✓</span>
        <div className="batch-progress-text">
          <strong className="success" data-testid="batch-progress-title">Batch split complete</strong>
          <span data-testid="batch-progress-file">{saved} processed · ready</span>
        </div>
      </div>
      <div className="batch-progress-center">
        <Track percent={100} testid="batch-progress-track" />
        <div className="batch-progress-stats">
          <span data-testid="batch-progress-completed">{done} completed / {total}</span>
          <span data-testid="batch-progress-remaining">0 remaining</span>
        </div>
      </div>
      <div className="batch-progress-right">
        <span className="batch-progress-percent">100%</span>
        <button type="button" className="svg-btn primary tiny" data-testid="batch-progress-review" onClick={props.onReview}>→ Review results</button>
        <button type="button" className="batch-progress-close" data-testid="batch-progress-dismiss" aria-label="Dismiss" onClick={props.onDismiss}>✕</button>
      </div>
    </div>
  );
}

function Track({ percent, testid }: { percent: number; testid: string }) {
  return (
    <div className="batch-progress-track" data-testid={testid}>
      <div className="batch-progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

function useEsc(onEsc: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEsc(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEsc]);
}

function CancelDialog(props: Props & { onKeep: () => void; onConfirm: () => void }) {
  useEsc(props.onKeep);
  const { done, left, total, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number; left: number; total: number };
  const currentName = props.progress?.currentName ?? currentRow?.name ?? "";
  const currentIndex = done + 1;
  return (
    <div className="svg-backdrop" data-testid="batch-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-cancel-title">
      <div className="svg-modal narrow">
        <div className="svg-modal-head">
          <h2 id="batch-cancel-title">Cancel batch split?</h2>
          <button type="button" className="svg-btn ghost tiny" data-testid="batch-cancel-close" aria-label="Close" onClick={props.onKeep}>✕</button>
        </div>
        <div className="svg-modal-body">
          <p>Stop the remaining splits? Your {done} completed files will stay saved.</p>
          <CurrentLine thumbFor={props.thumbFor} row={currentRow} index={currentIndex} total={total} name={currentName} />
          <div className="svg-cancel-stats" data-testid="batch-cancel-stats">
            <span className="kept">{done} completed · kept</span>
            <span className="stopped">{left} remaining · stopped</span>
          </div>
          <p className="svg-note">The current file may still finish; any valid result will be saved.</p>
          <div className="svg-modal-actions">
            <span className="svg-note">Esc to keep running</span>
            <button type="button" className="svg-btn primary" data-testid="batch-cancel-keep" onClick={props.onKeep}>Keep running</button>
            <button type="button" className="svg-btn danger" data-testid="batch-cancel-confirm" onClick={props.onConfirm}>Cancel batch</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentLine({ thumbFor, row, index, total, name }: { thumbFor: Props["thumbFor"]; row: Row | null; index: number; total: number; name: string }) {
  return (
    <div className="svg-cancel-current" data-testid="batch-cancel-current">
      <ProgressThumb thumbFor={thumbFor} relPath={row?.relPath ?? null} name={name} />
      <div>
        <small>Currently splitting · file {index} of {total}</small>
        <strong title={name}>{name}</strong>
      </div>
    </div>
  );
}

function ProgressThumb({ thumbFor, relPath, name }: { thumbFor: Props["thumbFor"]; relPath: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!relPath) { setUrl(null); return; }
    let live = true;
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor]);

  if (!relPath) return <span className="batch-progress-thumb empty" data-testid="batch-progress-thumb">◍</span>;
  return url ? (
    <img className="batch-progress-thumb" data-testid="batch-progress-thumb" src={url} alt={name} />
  ) : (
    <span className="batch-progress-thumb empty" data-testid="batch-progress-thumb">{name.slice(0, 2)}</span>
  );
}

// SvgProgressHeader.tsx — persistent progress bar pinned above tab header.
// Shows current thumbnail + filename, completed/remaining, progress bar, Cancel with confirmation.
// Portalled to #svg-progress-mount in Workbench so it stays visible when switching tabs.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSideThumbs } from "../selection/thumbs";
import type { DirHandleLike } from "../lib/fs";
import { runTotals, withChain, type Chain } from "./runtotals";
import type { QueueItem } from "./runqueue";
import type { RunProgress, SvgRow } from "./types";

interface Props {
  progress: RunProgress | null;
  running: boolean;
  queue: readonly QueueItem[];
  chain: Chain;
  currentId: string | null;
  rows: SvgRow[];
  rootRef: { current: DirHandleLike | null };
  onCancel: () => void;
  onDismiss: () => void;
  onReview: () => void;
}

export default function SvgProgressHeader(p: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const runId = p.progress?.runId ?? null;
  const shouldShow = p.progress !== null && runId !== dismissed;

  useEffect(() => {
    if (runId && dismissed && runId !== dismissed) setDismissed(null);
  }, [runId, dismissed]);

  if (!shouldShow || !p.progress) return null;

  const mount = document.getElementById("svg-progress-mount");
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
  const { progress, queue, chain, currentId, rows } = props;
  if (!progress) return { totals: null, currentRow: null, done: 0, left: 0, images: 0, percent: 0 };
  const totals = withChain(runTotals(progress, queue), chain);
  const done = totals.done;
  const left = totals.left;
  const images = progress.images;
  const percent = images > 0 ? Math.round((done / images) * 100) : 0;
  const currentRow = currentId ? rows.find((r) => r.source.id === currentId) ?? null : rows.find((r) => r.running) ?? null;
  return { totals, currentRow, done, left, images, percent };
}

function RunningBar(props: Props & { onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const { done, left, images, percent, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number };
  const currentName = (currentRow as SvgRow | null)?.source.name ?? "";
  return (
    <div className="svg-progress-header" data-testid="svg-progress-header">
      <div className="svg-progress-left">
        <ProgressThumb rootRef={props.rootRef} row={currentRow as SvgRow | null} />
        <div className="svg-progress-text">
          <strong data-testid="svg-progress-title">Generating SVGs · {images} images</strong>
          <span className="svg-progress-file" data-testid="svg-progress-file" title={currentName}>{currentName}</span>
        </div>
      </div>
      <div className="svg-progress-center">
        <Track percent={percent} />
        <div className="svg-progress-stats">
          <span data-testid="svg-progress-completed">{done} completed / {images}</span>
          <span data-testid="svg-progress-remaining">{left} remaining</span>
        </div>
      </div>
      <div className="svg-progress-right">
        <span className="svg-progress-percent" data-testid="svg-progress-percent">{percent}%</span>
        <button type="button" className="svg-btn tiny" data-testid="svg-progress-cancel" onClick={props.onCancelClick}>✕ Cancel batch</button>
      </div>
    </div>
  );
}

function CompleteBar(props: Props & { onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const { done, images } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number };
  const saved = props.progress?.saved ?? done;
  return (
    <div className="svg-progress-header complete" data-testid="svg-progress-header">
      <div className="svg-progress-left">
        <span className="svg-progress-check" aria-hidden="true">✓</span>
        <div className="svg-progress-text">
          <strong className="success" data-testid="svg-progress-title">SVG batch complete</strong>
          <span data-testid="svg-progress-file">{saved} results saved · ready for review</span>
        </div>
      </div>
      <div className="svg-progress-center">
        <Track percent={100} />
        <div className="svg-progress-stats">
          <span data-testid="svg-progress-completed">{done} completed / {images}</span>
          <span data-testid="svg-progress-remaining">0 remaining</span>
        </div>
      </div>
      <div className="svg-progress-right">
        <span className="svg-progress-percent">100%</span>
        <button type="button" className="svg-btn primary tiny" data-testid="svg-progress-review" onClick={props.onReview}>→ Review results</button>
        <button type="button" className="svg-progress-close" data-testid="svg-progress-dismiss" aria-label="Dismiss" onClick={props.onDismiss}>✕</button>
      </div>
    </div>
  );
}

function Track({ percent }: { percent: number }) {
  return (
    <div className="svg-progress-track" data-testid="svg-progress-track">
      <div className="svg-progress-fill" style={{ width: `${percent}%` }} />
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
  const { done, left, images, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number; left: number };
  const currentName = (currentRow as SvgRow | null)?.source.name ?? "";
  const currentIndex = done + 1;
  return (
    <div className="svg-backdrop" data-testid="svg-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="svg-cancel-title">
      <div className="svg-modal narrow">
        <div className="svg-modal-head">
          <h2 id="svg-cancel-title">Cancel SVG batch?</h2>
          <button type="button" className="svg-btn ghost tiny" data-testid="svg-cancel-close" aria-label="Close" onClick={props.onKeep}>✕</button>
        </div>
        <div className="svg-modal-body">
          <p>Stop the remaining generation and regeneration requests? Your {done} completed SVGs will stay saved.</p>
          <CurrentLine row={currentRow as SvgRow | null} rootRef={props.rootRef} index={currentIndex} total={images} name={currentName} />
          <div className="svg-cancel-stats" data-testid="svg-cancel-stats">
            <span className="kept">{done} completed · kept</span>
            <span className="stopped">{left} remaining · stopped</span>
          </div>
          <p className="svg-note">Unsent requests will be removed from the queue. The current request may still finish; any valid result will be saved. Previous versions are never deleted.</p>
          <div className="svg-modal-actions">
            <span className="svg-note">Esc to keep running</span>
            <button type="button" className="svg-btn primary" data-testid="svg-cancel-keep" onClick={props.onKeep}>Keep running</button>
            <button type="button" className="svg-btn danger" data-testid="svg-cancel-confirm" onClick={props.onConfirm}>Cancel batch</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentLine({ row, rootRef, index, total, name }: { row: SvgRow | null; rootRef: Props["rootRef"]; index: number; total: number; name: string }) {
  return (
    <div className="svg-cancel-current" data-testid="svg-cancel-current">
      <ProgressThumb rootRef={rootRef} row={row} />
      <div>
        <small>Currently generating · image {index} of {total}</small>
        <strong title={name}>{name}</strong>
      </div>
    </div>
  );
}

function ProgressThumb({ rootRef, row }: { rootRef: { current: DirHandleLike | null }; row: SvgRow | null }) {
  const thumbFor = useSideThumbs(rootRef);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!row) { setUrl(null); return; }
    let live = true;
    thumbFor(row.source.relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [row?.source.relPath, thumbFor]);

  if (!row) return <span className="svg-progress-thumb empty" data-testid="svg-progress-thumb">◍</span>;
  return url ? (
    <img className="svg-progress-thumb" data-testid="svg-progress-thumb" src={url} alt={row.source.name} />
  ) : (
    <span className="svg-progress-thumb empty" data-testid="svg-progress-thumb">{row.source.name.slice(0, 2)}</span>
  );
}

// BatchProgressHeader.tsx — persistent progress bar for batch split & preview, same as Generate SVG bar
// Portalled to #batch-progress-mount so it stays visible when switching tabs

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { batchTotals, type BatchProgress } from "./BatchProgress";
import type { Row } from "./useBatchTypes";

type Mode = "split" | "preview";

interface Props {
  progress: BatchProgress | null;
  running: boolean;
  rows: Row[];
  thumbFor: (relPath: string) => Promise<string>;
  onCancel: () => void;
  onDismiss: () => void;
  onReview: () => void;
  mode?: Mode;
}

function testId(mode: Mode, name: string): string {
  return mode === "preview" ? `batch-preview-${name}` : `batch-${name}`;
}

export default function BatchProgressHeader(p: Props) {
  const mode = p.mode ?? "split";
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
      <Bar {...p} mode={mode} onCancelClick={() => setShowCancel(true)} onDismiss={() => { setDismissed(runId); p.onDismiss(); }} onReview={p.onReview} />
      {showCancel && <CancelDialog {...p} mode={mode} onKeep={() => setShowCancel(false)} onConfirm={() => { setShowCancel(false); p.onCancel(); }} />}
    </>
  );

  return mount ? createPortal(content, mount) : content;
}

function Bar(props: Props & { mode: Mode; onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  return props.running ? <RunningBar {...props} /> : <CompleteBar {...props} />;
}

function useCurrent(props: Props) {
  const { progress, rows } = props;
  if (!progress) return { totals: null, currentRow: null, done: 0, left: 0, percent: 0, total: 0 };
  const totals = batchTotals(progress);
  const currentRow = progress.currentRelPath ? rows.find((r) => r.relPath === progress.currentRelPath) ?? null : null;
  return { totals, currentRow, done: totals.done, left: totals.left, percent: totals.percent, total: progress.total };
}

function RunningBar(props: Props & { mode: Mode; onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const mode = props.mode ?? "split";
  const { done, left, percent, total, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number };
  const currentName = props.progress?.currentName ?? currentRow?.name ?? "";
  const title = mode === "preview" ? `Previewing splits · ${total} files` : `Splitting icons · ${total} files`;
  return (
    <div className="batch-progress-header" data-testid={testId(mode, "progress-header")}>
      <div className="batch-progress-left">
        <ProgressThumb thumbFor={props.thumbFor} relPath={props.progress?.currentRelPath ?? null} name={currentName} mode={mode} />
        <div className="batch-progress-text">
          <strong data-testid={testId(mode, "progress-title")}>{title}</strong>
          <span className="batch-progress-file" data-testid={testId(mode, "progress-file")} title={currentName}>{currentName}</span>
        </div>
      </div>
      <div className="batch-progress-center">
        <Track percent={percent} testid={testId(mode, "progress-track")} />
        <div className="batch-progress-stats">
          <span data-testid={testId(mode, "progress-completed")}>{done} completed / {total}</span>
          <span data-testid={testId(mode, "progress-remaining")}>{left} remaining</span>
        </div>
      </div>
      <div className="batch-progress-right">
        <span className="batch-progress-percent" data-testid={testId(mode, "progress-percent")}>{percent}%</span>
        <button type="button" className="svg-btn tiny" data-testid={testId(mode, "progress-cancel")} onClick={props.onCancelClick}>✕ Cancel {mode === "preview" ? "preview" : "batch"}</button>
      </div>
    </div>
  );
}

function CompleteBar(props: Props & { mode: Mode; onCancelClick: () => void; onDismiss: () => void; onReview: () => void }) {
  const mode = props.mode ?? "split";
  const { done, total } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number; total: number };
  const saved = props.progress?.saved ?? done;
  const title = mode === "preview" ? "Preview complete" : "Batch split complete";
  const sub = mode === "preview" ? `${saved} previews · ready` : `${saved} processed · ready`;
  return (
    <div className="batch-progress-header complete" data-testid={testId(mode, "progress-header")}>
      <div className="batch-progress-left">
        <span className="batch-progress-check" aria-hidden="true">✓</span>
        <div className="batch-progress-text">
          <strong className="success" data-testid={testId(mode, "progress-title")}>{title}</strong>
          <span data-testid={testId(mode, "progress-file")}>{sub}</span>
        </div>
      </div>
      <div className="batch-progress-center">
        <Track percent={100} testid={testId(mode, "progress-track")} />
        <div className="batch-progress-stats">
          <span data-testid={testId(mode, "progress-completed")}>{done} completed / {total}</span>
          <span data-testid={testId(mode, "progress-remaining")}>0 remaining</span>
        </div>
      </div>
      <div className="batch-progress-right">
        <span className="batch-progress-percent">100%</span>
        <button type="button" className="svg-btn primary tiny" data-testid={testId(mode, "progress-review")} onClick={props.onReview}>→ Review results</button>
        <button type="button" className="batch-progress-close" data-testid={testId(mode, "progress-dismiss")} aria-label="Dismiss" onClick={props.onDismiss}>✕</button>
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

function dialogTexts(mode: Mode, done: number) {
  if (mode === "preview") return { title: "Cancel preview?", body: `Stop the remaining previews? Your ${done} completed previews will stay.` };
  return { title: "Cancel batch split?", body: `Stop the remaining splits? Your ${done} completed files will stay saved.` };
}

function CancelDialog(props: Props & { mode: Mode; onKeep: () => void; onConfirm: () => void }) {
  const mode = props.mode ?? "split";
  useEsc(props.onKeep);
  const { done, left, total, currentRow } = useCurrent(props) as ReturnType<typeof useCurrent> & { done: number; left: number; total: number };
  const currentName = props.progress?.currentName ?? currentRow?.name ?? "";
  const currentIndex = done + 1;
  const { title, body } = dialogTexts(mode, done);
  return (
    <div className="svg-backdrop" data-testid={testId(mode, "cancel-dialog")} role="dialog" aria-modal="true" aria-labelledby="batch-cancel-title">
      <div className="svg-modal narrow">
        <div className="svg-modal-head">
          <h2 id="batch-cancel-title">{title}</h2>
          <button type="button" className="svg-btn ghost tiny" data-testid={testId(mode, "cancel-close")} aria-label="Close" onClick={props.onKeep}>✕</button>
        </div>
        <div className="svg-modal-body">
          <p>{body}</p>
          <CurrentLine thumbFor={props.thumbFor} row={currentRow} index={currentIndex} total={total} name={currentName} mode={mode} />
          <CancelStats mode={mode} done={done} left={left} />
          <div className="svg-modal-actions">
            <span className="svg-note">Esc to keep running</span>
            <button type="button" className="svg-btn primary" data-testid={testId(mode, "cancel-keep")} onClick={props.onKeep}>Keep running</button>
            <button type="button" className="svg-btn danger" data-testid={testId(mode, "cancel-confirm")} onClick={props.onConfirm}>Cancel {mode === "preview" ? "preview" : "batch"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelStats({ mode, done, left }: { mode: Mode; done: number; left: number }) {
  return (
    <>
      <div className="svg-cancel-stats" data-testid={testId(mode, "cancel-stats")}>
        <span className="kept">{done} completed · kept</span>
        <span className="stopped">{left} remaining · stopped</span>
      </div>
      <p className="svg-note">{mode === "preview" ? "Preview will stop after current file." : "The current file may still finish; any valid result will be saved."}</p>
    </>
  );
}

function CurrentLine({ thumbFor, row, index, total, name, mode }: { thumbFor: Props["thumbFor"]; row: Row | null; index: number; total: number; name: string; mode: Mode }) {
  const small = mode === "preview" ? `Currently previewing · file ${index} of ${total}` : `Currently splitting · file ${index} of ${total}`;
  return (
    <div className="svg-cancel-current" data-testid={testId(mode, "cancel-current")}>
      <ProgressThumb thumbFor={thumbFor} relPath={row?.relPath ?? null} name={name} mode={mode} />
      <div>
        <small>{small}</small>
        <strong title={name}>{name}</strong>
      </div>
    </div>
  );
}

function ProgressThumb({ thumbFor, relPath, name, mode }: { thumbFor: Props["thumbFor"]; relPath: string | null; name: string; mode: Mode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!relPath) { setUrl(null); return; }
    let live = true;
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor]);

  if (!relPath) return <span className="batch-progress-thumb empty" data-testid={testId(mode, "progress-thumb")} style={{ width: 32, height: 32 }}>◍</span>;
  return url ? (
    <img className="batch-progress-thumb" data-testid={testId(mode, "progress-thumb")} src={url} alt={name} style={{ width: 32, height: 32, objectFit: 'cover' }} />
  ) : (
    <span className="batch-progress-thumb empty" data-testid={testId(mode, "progress-thumb")} style={{ width: 32, height: 32 }}>{name.slice(0, 2)}</span>
  );
}

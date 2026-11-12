// StockUploadDialogs.tsx — row-badge catalog dialog, FTPS/SFTP preflight
// confirmation modal, and cross-tab portal progress header.

import { useState } from "react";
import { createPortal } from "react-dom";
import { gettyWebBatchSummaryOf, gettyWebIconSizes } from "../lib/stockupload/gettyweb";
import { applySubmittedUploadPolicy, type StockUploadPlan } from "../lib/stockupload/plan";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import UploadRowBadgeSettings from "../upload/UploadRowBadgeSettings";
import { stockStatusOf, uploadBar } from "./progressmodel";
import { setAppState } from "../state/appstore";
import type { StockUploadApi } from "./useStockUpload";
import StockUploadHistoryDialog from "./StockUploadHistoryDialog";
import StockRejectedUploadsDialog from "./StockRejectedUploadsDialog";
import StockRemovalProgress from "./StockRemovalProgress";

/** The Getty web target ids of a plan, so its icons can be sized per pair. */
function gettyTargetIds(plan: StockUploadPlan): ReadonlySet<string> {
  return new Set(plan.targets.filter((t) => t.protocol === "getty-web").map((t) => t.id));
}

export default function StockUploadDialogs({ g }: { g: StockUploadApi }) {
  const d = g.model.dialog;
  return (
    <>
      <StockProgressPortal g={g} />
      <StockRemovalProgress />
      {d?.kind === "uploadHistory" && <StockUploadHistoryDialog g={g} />}
      {d?.kind === "rejectedUploads" && <StockRejectedUploadsDialog g={g} />}
      {d?.kind === "rowBadges" && (
        <UploadRowBadgeSettings
          state={g.rowBadges}
          onAdd={g.addRowBadge}
          onRename={g.renameRowBadge}
          onRecolor={g.recolorRowBadge}
          onRemove={g.removeRowBadge}
          onClose={g.closeDialog}
        />
      )}
      {d?.kind === "confirmUpload" && (
        <ConfirmUploadModal plan={d.plan} onConfirm={g.confirmUpload} onCancel={g.closeDialog} />
      )}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UploadNoteField({ note, onChange }: { note: string; onChange: (value: string) => void }) {
  return (
    <div className="stock-upload-confirm-note-field">
      <label htmlFor="stock-upload-confirm-note">Upload note <span>Optional · saved with batch history</span></label>
      <textarea id="stock-upload-confirm-note" className="svg-input" data-testid="stock-upload-confirm-note"
        maxLength={1000} rows={2} placeholder="Add context for this upload run" value={note}
        onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function submittedIconCount(plan: StockUploadPlan, targetId: string): number {
  const submitted = new Set(plan.submittedItemIdsByTarget?.[targetId] ?? []);
  return new Set(plan.tasks.filter((task) => task.targetId === targetId && submitted.has(task.itemId)).map((task) => task.itemId)).size;
}

function SubmittedReuploadChoices({ plan, selected, onToggle }: {
  plan: StockUploadPlan; selected: readonly string[]; onToggle: (id: string, enabled: boolean) => void;
}) {
  const choices = plan.targets.map((target) => ({ target, count: submittedIconCount(plan, target.id) }))
    .filter((choice) => choice.count > 0);
  if (choices.length === 0) return null;
  return (
    <fieldset className="stock-upload-reupload" data-testid="stock-upload-reupload-options">
      <legend>Already submitted icons</legend>
      <p>Badged icons are skipped by default. Check a stock to re-upload its marked icons; unbadged icons still upload.</p>
      <div className="stock-upload-reupload-list">
        {choices.map(({ target, count }) => <label key={target.id}>
          <input type="checkbox" data-testid={`stock-upload-reupload-${target.id}`}
            checked={selected.includes(target.id)} onChange={(event) => onToggle(target.id, event.target.checked)} />
          <span>Re-upload {count} previously submitted icon(s) to <strong>{target.name}</strong></span>
        </label>)}
      </div>
    </fieldset>
  );
}

function useSubmittedReuploadChoice(plan: StockUploadPlan) {
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const toggle = (id: string, enabled: boolean) => setTargetIds((current) =>
    enabled ? current.includes(id) ? current : [...current, id] : current.filter((targetId) => targetId !== id));
  return { targetIds, toggle, effectivePlan: applySubmittedUploadPolicy(plan, targetIds) };
}

function ConfirmUploadModal({ plan, onConfirm, onCancel }: {
  plan: StockUploadPlan; onConfirm: (note: string, reuploadTargetIds: readonly string[]) => void; onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const choice = useSubmittedReuploadChoice(plan);
  return (
    <div className="svg-backdrop" data-testid="stock-upload-confirm-backdrop" onClick={onCancel}>
      <section className="svg-modal narrow" role="dialog" aria-modal="true"
        aria-labelledby="stock-upload-confirm-title" data-testid="stock-upload-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <header className="svg-modal-head">
          <h2 id="stock-upload-confirm-title">Confirm Stock Upload</h2>
          <button type="button" className="svg-btn tiny" onClick={onCancel}>Close</button>
        </header>
        <SubmittedReuploadChoices plan={plan} selected={choice.targetIds} onToggle={choice.toggle} />
        <ConfirmPlanBody plan={choice.effectivePlan} />
        <UploadNoteField note={note} onChange={setNote} />
        <ConfirmUploadActions canUpload={choice.effectivePlan.tasks.length > 0}
          onCancel={onCancel} onConfirm={() => onConfirm(note, choice.targetIds)} />
      </section>
    </div>
  );
}

function ConfirmUploadActions({ canUpload, onCancel, onConfirm }: {
  canUpload: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <footer className="svg-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button type="button" className="svg-btn" data-testid="stock-upload-confirm-cancel" onClick={onCancel}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="stock-upload-confirm-go"
        disabled={!canUpload} onClick={onConfirm}>⇪ Start Upload</button>
    </footer>
  );
}

function targetPlanLabel(t: StockUploadPlan["targets"][number]): string {
  if (t.protocol === "esp-batch") return `${t.name} (ESP batch folder ${t.remoteDir}/)`;
  return `${t.name} (${t.host}:${t.port})`;
}

/** What "Limit" drew for this run, and what stays for a later one. */
function LimitNote({ limit }: { limit: NonNullable<StockUploadPlan["limit"]> }) {
  return (
    <p className="svg-note strong" data-testid="stock-upload-limit-note">
      {`Limit ${limit.limit}: ${limit.chosen} of ${limit.total} icons drawn at random, sent in random batches of 100 — ${limit.total - limit.chosen} stay for a later run.`}
    </p>
  );
}

function ConfirmationCount({ plan }: { plan: StockUploadPlan }) {
  if (plan.tasks.length === 0) {
    return <p className="svg-warning">No files will be uploaded. Choose a stock above to re-upload its already-marked icons.</p>;
  }
  return <p>
    Upload <strong>{plan.tasks.length}</strong> file(s) ({formatBytes(plan.totalBytes)}) for{" "}
    <strong>{plan.selectedRows.length}</strong> item(s) across <strong>{plan.targets.map(targetPlanLabel).join(", ")}</strong>.
  </p>;
}

function ConfirmPlanBody({ plan }: { plan: StockUploadPlan }) {
  return (
    <div className="svg-modal-body">
      <ConfirmationCount plan={plan} />
      {plan.tasks.length > 0 && <p className="svg-note">Formats: <strong>{plan.selectedFormats.join(", ").toUpperCase()}</strong></p>}
      {plan.tasks.length > 0 && <ul className="svg-note" data-testid="stock-upload-target-formats">
        {plan.targets.map((target) => <li key={target.id}>{target.name}: {Array.from(new Set(plan.tasks.filter((task) => task.targetId === target.id).map((task) => task.format))).join(", ").toUpperCase() || "no available files"}{plan.combineByTarget?.[target.id] ? " · Title + description" : ""}</li>)}
      </ul>}
      {plan.limit !== undefined && <LimitNote limit={plan.limit} />}
      {plan.targets.some((t) => t.protocol === "getty-web") && (
        <p className="svg-note" data-testid="stock-upload-getty-batches">
          Getty Images: {gettyWebBatchSummaryOf(gettyWebIconSizes(plan.tasks, gettyTargetIds(plan)))}
        </p>
      )}
      {plan.combineTitleDescription && <p className="svg-warning">Title + description will be combined in upload copies only. Stock sites may limit title length; originals remain unchanged.</p>}
      {plan.skippedMissing.length > 0 && (
        <p className="svg-warning">
          ⚠ {plan.skippedMissing.length} requested format file(s) do not exist in `export/` and will be skipped.
        </p>
      )}
      {plan.warnings.map((w) => <p key={w} className="svg-warning">⚠ {w}</p>)}
    </div>
  );
}

function StockProgressPortal({ g }: { g: StockUploadApi }) {
  const p = g.model.progress;
  if (p === null) return null;
  const bar = uploadBar(p);
  const content = (
    <ProcessProgressBar prefix="stock-upload" theme="svg" title={bar.title} detail={bar.detail}
      done={bar.done} total={bar.total} remaining={bar.remaining} percent={bar.percent}
      status={stockStatusOf(p)} runId={p.runId ?? ""}
      leading={<span className="svg-progress-check" aria-hidden="true">◍</span>}
      onCancel={g.cancelUpload} onReview={() => setAppState({ tab: "stockUpload" })} onDismiss={g.dismissProgress} />
  );
  const mount = document.getElementById("stock-upload-progress-mount");
  return mount ? createPortal(content, mount) : content;
}

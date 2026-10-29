// StockUploadDialogs.tsx — row-badge catalog dialog, FTPS/SFTP preflight
// confirmation modal, and cross-tab portal progress header.

import { createPortal } from "react-dom";
import type { StockUploadPlan } from "../lib/stockupload/plan";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import UploadRowBadgeSettings from "../upload/UploadRowBadgeSettings";
import type { StockUploadApi } from "./useStockUpload";

export default function StockUploadDialogs({ g }: { g: StockUploadApi }) {
  const d = g.model.dialog;
  return (
    <>
      <StockProgressPortal g={g} />
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

function ConfirmUploadModal({ plan, onConfirm, onCancel }: {
  plan: StockUploadPlan; onConfirm: () => void; onCancel: () => void;
}) {
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
        <ConfirmPlanBody plan={plan} />
        <footer className="svg-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="svg-btn" data-testid="stock-upload-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="svg-btn primary" data-testid="stock-upload-confirm-go" onClick={onConfirm}>
            ⇪ Start Upload
          </button>
        </footer>
      </section>
    </div>
  );
}

function targetPlanLabel(t: StockUploadPlan["targets"][number]): string {
  if (t.protocol === "esp-batch") return `${t.name} (ESP batch folder ${t.remoteDir}/)`;
  return `${t.name} (${t.host}:${t.port})`;
}

function ConfirmPlanBody({ plan }: { plan: StockUploadPlan }) {
  return (
    <div className="svg-modal-body">
      <p>
        Upload <strong>{plan.tasks.length}</strong> file(s) ({formatBytes(plan.totalBytes)}) for{" "}
        <strong>{plan.selectedRows.length}</strong> item(s) across{" "}
        <strong>{plan.targets.map(targetPlanLabel).join(", ")}</strong>.
      </p>
      <p className="svg-note">
        Formats: <strong>{plan.selectedFormats.join(", ").toUpperCase()}</strong>
      </p>
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
  if (!g.model.uploading || p === null) return null;
  const total = Math.max(1, p.total);
  const pct = Math.min(100, Math.round((p.done / total) * 100));
  const bar = (
    <ProcessProgressBar
      prefix="stock-upload"
      theme="svg"
      title="Uploading to stock sites"
      detail={p.label}
      done={p.done}
      total={p.total}
      remaining={Math.max(0, p.total - p.done)}
      percent={pct}
      complete={false}
      leading={<span className="svg-progress-check" aria-hidden="true">◍</span>}
      actions={
        <button type="button" className="svg-btn tiny" data-testid="stock-progress-cancel" onClick={g.cancelUpload}>
          Cancel
        </button>
      }
    />
  );
  const mount = document.getElementById("stock-upload-progress-mount");
  return mount ? createPortal(bar, mount) : bar;
}

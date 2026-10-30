// StockUploadDialogs.tsx — row-badge catalog dialog, FTPS/SFTP preflight
// confirmation modal, and cross-tab portal progress header.

import { createPortal } from "react-dom";
import type { StockUploadPlan } from "../lib/stockupload/plan";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import UploadRowBadgeSettings from "../upload/UploadRowBadgeSettings";
import type { GettyWebRetryTarget } from "./batchtypes";
import { uploadBar, type UploadBar } from "./progressmodel";
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
  if (p === null) return null;
  const bar = uploadBar(p);
  const content = (
    <ProcessProgressBar
      prefix="stock-upload"
      theme="svg"
      title={bar.title}
      detail={bar.detail}
      done={bar.done}
      total={bar.total}
      remaining={bar.remaining}
      percent={bar.percent}
      complete={bar.finished}
      leading={<span className="svg-progress-check" aria-hidden="true">{bar.finished ? "✓" : "◍"}</span>}
      actions={<ProgressActions g={g} bar={bar} running={g.model.uploading} retry={g.model.retry} />}
    />
  );
  const mount = document.getElementById("stock-upload-progress-mount");
  return mount ? createPortal(content, mount) : content;
}

/**
 * A finished bar is done: it offers the same ✕ close as the other process
 * headers instead of a Cancel that has nothing left to stop.
 */
function ProgressActions(
  { g, bar, running, retry }: {
    g: StockUploadApi; bar: UploadBar; running: boolean; retry: GettyWebRetryTarget | null | undefined;
  },
) {
  const close = (
    <button type="button" className="svg-progress-close" data-testid="stock-progress-dismiss"
      aria-label="Close upload progress" onClick={g.dismissProgress}>✕</button>
  );
  if (bar.finished) {
    // Only a batch the helper still holds can be retried: no button otherwise.
    if (!retry || retry.names.length === 0) return <>{close}</>;
    return (
      <>
        <button type="button" className="svg-btn tiny" data-testid="stock-progress-retry" onClick={g.retryOpenFiles}>
          Retry not-ready files
        </button>
        {close}
      </>
    );
  }
  return (
    <>
      <button type="button" className="svg-btn tiny" data-testid="stock-progress-cancel" onClick={g.cancelUpload}>
        Cancel
      </button>
      {!running ? close : null}
    </>
  );
}

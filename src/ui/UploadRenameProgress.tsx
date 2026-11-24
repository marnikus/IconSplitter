// UploadRenameProgress.tsx — top-of-shell ProcessProgressBar for bulk upload
// file renaming across SVG builder, SVG to upload, and Stock upload. Shows live
// progress (done/total/remaining/% + current item + Cancel) and keeps the
// finished result summary open until dismissed or replaced by the next run.

import { createPortal } from "react-dom";
import { setAppState, type AppState } from "../state/appstore";
import ProcessProgressBar from "./ProcessProgressBar";
import { useProcessSlot } from "./useProcessSlot";
import {
  cancelRenameRun,
  dismissRenameRun,
  renameBarCopy,
  renamePrefixOf,
  renameSlotOf,
  type RenameSource,
} from "../upload/renameprogress";

const MOUNTS: Record<RenameSource, string> = {
  svgBuilder: "builder-progress-mount",
  upload: "upload-progress-mount",
  stockUpload: "stock-upload-progress-mount",
};

const TABS: Record<RenameSource, AppState["tab"]> = {
  svgBuilder: "svgBuilder",
  upload: "upload",
  stockUpload: "stockUpload",
};

const TARGETS: Record<RenameSource, string> = {
  svgBuilder: '[data-testid="builder-artboards"]',
  upload: '[data-testid="upload-list"]',
  stockUpload: '[data-testid="stock-upload-list"]',
};

function reviewSource(source: RenameSource): void {
  setAppState({ tab: TABS[source] });
  requestAnimationFrame(() => {
    document.querySelector(TARGETS[source])?.scrollIntoView({ block: "nearest" });
  });
}

export default function UploadRenameProgress({ source }: { source: RenameSource }) {
  const p = useProcessSlot(renameSlotOf(source));
  if (p === null || p.total <= 0) return null;
  const { title, detail, totals } = renameBarCopy(p);
  const bar = (
    <ProcessProgressBar
      prefix={renamePrefixOf(source)}
      theme="svg"
      title={title}
      detail={detail}
      done={totals.done}
      total={totals.total}
      remaining={totals.left}
      percent={totals.percent}
      status={p.status}
      runId={p.runId}
      leading={<span className="svg-progress-check" aria-hidden="true">✎</span>}
      cancelDisabled={p.cancelling}
      onCancel={() => cancelRenameRun(source)}
      onReview={() => reviewSource(source)}
      onDismiss={() => dismissRenameRun(source)}
    />
  );
  const mount = document.getElementById(MOUNTS[source]);
  return mount ? createPortal(bar, mount) : bar;
}

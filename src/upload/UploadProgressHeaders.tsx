// Upload's domain adapter for the app-wide process header, visible across tabs.
import { createPortal } from "react-dom";
import { processTotals, type ProcessStatus } from "../lib/processprogress";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { setAppState } from "../state/appstore";
import type { UploadApi } from "./useUpload";
import type { UploadProcessKind } from "./processprogress";

export default function UploadProgressHeaders({ g }: { g: UploadApi }) {
  const content = <><UploadProcess g={g} kind="metadata" /><UploadProcess g={g} kind="export" /></>;
  const mount = document.getElementById("upload-progress-mount");
  return mount ? createPortal(content, mount) : content;
}

function UploadProcess({ g, kind }: { g: UploadApi; kind: UploadProcessKind }) {
  const progress = g.processes[kind];
  if (progress === null) return null;
  const totals = processTotals(progress);
  const running = progress.status === "running";
  const prefix = `upload-${kind}`;
  const title = progressTitle(kind, progress.status);
  const active = g.rows.filter((row) => row.running === kind).map((row) => row.source.svgName).join(" · ");
  const detail = running ? active || "Preparing batch…" : "Finished results are kept · review row outcomes";
  return (
    <ProcessProgressBar prefix={prefix} theme="svg" title={title} detail={detail} done={totals.done} total={totals.total}
      remaining={totals.left} percent={totals.percent} complete={progress.status === "completed"}
      leading={<span className="svg-progress-check" aria-hidden="true">{ICONS[progress.status]}</span>}
      actions={<ProgressActions g={g} kind={kind} />} />
  );
}

const ICONS: Record<ProcessStatus, string> = { running: "◍", completed: "✓", cancelled: "■", failed: "!" };

function progressTitle(kind: UploadProcessKind, status: ProcessStatus): string {
  if (status === "running") return kind === "metadata" ? "Generating metadata" : "Exporting packages";
  const name = kind === "metadata" ? "Metadata" : "Export";
  if (status === "failed") return `${name} stopped with errors`;
  return `${name} ${status === "completed" ? "complete" : "cancelled"}`;
}

function ProgressActions({ g, kind }: { g: UploadApi; kind: UploadProcessKind }) {
  const progress = g.processes[kind];
  if (progress === null) return null;
  const prefix = `upload-${kind}`;
  if (progress.status === "running") return (
    <button type="button" className="svg-btn tiny" data-testid={`${prefix}-progress-cancel`}
      onClick={kind === "metadata" ? g.cancelMetadata : g.cancelExport}>Cancel run</button>
  );
  return (
    <>
      <button type="button" className="svg-btn primary tiny" data-testid={`${prefix}-progress-review`}
        onClick={() => setAppState({ tab: "upload" })}>→ Review results</button>
      <button type="button" className="svg-progress-close" aria-label={`Dismiss ${kind} progress`}
        data-testid={`${prefix}-progress-dismiss`} onClick={() => g.dispatch({ type: "process-dismiss", kind, runId: progress.runId })}>✕</button>
    </>
  );
}

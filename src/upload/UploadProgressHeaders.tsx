// Upload's domain adapter for the app-wide process header, visible across tabs.
import { createPortal } from "react-dom";
import { processTotals, type ProcessStatus } from "../lib/processprogress";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { setAppState } from "../state/appstore";
import type { UploadApi } from "./useUpload";
import type { UploadProcessKind } from "./processprogress";

export default function UploadProgressHeaders({ g }: { g: UploadApi }) {
  const content = <><UploadProcess g={g} kind="metadata" /><UploadProcess g={g} kind="export" /><UploadProcess g={g} kind="download" /></>;
  const mount = document.getElementById("upload-progress-mount");
  return mount ? createPortal(content, mount) : content;
}

function UploadProcess({ g, kind }: { g: UploadApi; kind: UploadProcessKind }) {
  const progress = g.processes[kind];
  if (progress == null) return null;
  const totals = processTotals(progress);
  const running = progress.status === "running";
  const active = kind === "download" ? g.busy : g.rows.filter((row) => row.running === kind).map((row) => row.source.svgName).join(" · ");
  const summary = kind === "download" ? "Verified copies are kept · review download outcome" : "Finished results are kept · review row outcomes";
  return (
    <ProcessProgressBar prefix={`upload-${kind}`} theme="svg" title={progressTitle(kind, progress.status)}
      detail={running ? active || "Preparing batch…" : summary} done={totals.done} total={totals.total}
      remaining={totals.left} percent={totals.percent} status={progress.status} runId={progress.runId}
      leading={<span className="svg-progress-check" aria-hidden="true">◍</span>}
      onCancel={{ metadata: g.cancelMetadata, export: g.cancelExport, download: g.cancelDownload }[kind]} cancelLabel="Cancel run"
      onReview={() => setAppState({ tab: "upload" })}
      onDismiss={() => g.dispatch({ type: "process-dismiss", kind, runId: progress.runId })} />
  );
}

const RUNNING_TITLES = { metadata: "Generating metadata", export: "Exporting packages", download: "Downloading exported files" };
const PROCESS_NAMES = { metadata: "Metadata", export: "Export", download: "Download" };

function progressTitle(kind: UploadProcessKind, status: ProcessStatus): string {
  if (status === "running") return RUNNING_TITLES[kind];
  const name = PROCESS_NAMES[kind];
  if (status === "failed") return `${name} stopped with errors`;
  return `${name} ${status === "completed" ? "complete" : "cancelled"}`;
}

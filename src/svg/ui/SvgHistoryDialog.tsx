// ui/SvgHistoryDialog.tsx — per-source version/request timeline, historical
// previews, prompt/usage metadata and reviewable versions; old files are immutable.

import type { SvgReviewDecision, SvgSourceRow } from "../types";
import type { SvgLoadedVersion } from "../types";
import SvgDialog from "./SvgDialog";
import SvgPreview from "./SvgPreview";

export default function SvgHistoryDialog({ row, root, onClose, onCode, onReview }: {
  row: SvgSourceRow; root: SvgHistoryRoot; onClose: () => void;
  onCode: (version: SvgLoadedVersion) => void;
  onReview: (version: number, decision: SvgReviewDecision) => void;
}) {
  const versions = [...row.versions].sort((a, b) => b.version - a.version);
  const requests = [...row.requests].reverse();
  return <SvgDialog title={`${row.filename} · version history`} onClose={onClose} wide>
    <p className="svg-modal-copy">Each SVG version is saved as a separate immutable file. Review decisions are per version; Requesty batch usage is shared and never apportioned to an individual icon.</p>
    <VersionHistory row={row} root={root} versions={versions} onCode={onCode} onReview={onReview} />
    <RequestHistory requests={requests} />
  </SvgDialog>;
}

function VersionHistory({ row, root, versions, onCode, onReview }: {
  row: SvgSourceRow; root: SvgHistoryRoot; versions: SvgLoadedVersion[];
  onCode: (version: SvgLoadedVersion) => void; onReview: (version: number, decision: SvgReviewDecision) => void;
}) {
  if (versions.length === 0) return <p>No valid SVG versions are available.</p>;
  return <>{versions.map((version) => <VersionCard key={version.version} row={row} root={root}
    version={version} onCode={onCode} onReview={onReview} />)}</>;
}

function RequestHistory({ requests }: { requests: SvgSourceRow["requests"] }) {
  return <section className="svg-request-history"><h3>Request history</h3>
    {requests.length ? requests.map((request) => <RequestCard key={request.clientRequestId} request={request} />)
      : <span>No requests recorded.</span>}
  </section>;
}

function RequestCard({ request }: { request: SvgSourceRow["requests"][number] }) {
  return <div className="svg-request-card">
    <strong>{request.status} · {request.startedAt}</strong>
    <span>Request {request.clientRequestId} · {request.model} · {request.manifest.length} images</span>
    <span>{usageLabel(request.usage.totalTokens, request.usage.actualCostUsd)}</span>
    {request.safeError && <p className="svg-error-copy">{request.safeError}</p>}
  </div>;
}

type SvgHistoryRoot = { current: import("../../lib/fs").DirHandleLike | null };

function VersionCard({ row, root, version, onCode, onReview }: {
  row: SvgSourceRow; root: SvgHistoryRoot; version: SvgLoadedVersion;
  onCode: (version: SvgLoadedVersion) => void; onReview: (version: number, decision: SvgReviewDecision) => void;
}) {
  return (
    <article className="svg-version-card">
      <div className="svg-version-heading"><strong>v{version.version} · {version.createdAt}</strong><span className={`svg-badge ${version.review}`}>{version.review}</span></div>
      <SvgPreview root={root} path={row.relativePath} svg={version.svg} alt={`${row.filename} version ${version.version}`} />
      <VersionMetadata version={version} />
      <details><summary>Prompt used</summary><pre className="svg-prompt-preview">{version.prompt || "Prompt metadata unavailable for this recovered file."}</pre></details>
      {!version.available && <p role="alert" className="svg-error-copy">This version is unavailable or no longer passes SVG validation.</p>}
      <VersionActions version={version} onCode={onCode} onReview={onReview} />
    </article>
  );
}

function VersionMetadata({ version }: { version: SvgLoadedVersion }) {
  return (
    <div className="svg-version-meta">
      <span>File: <code>{version.path}</code></span><span>Model: {version.model || "unknown"}</span>
      <span>{usageLabel(version.usage.totalTokens, version.usage.actualCostUsd)} · shared batch</span>
      <span>Validation: {version.validation.valid && version.validation.visible ? "valid and visible" : "invalid"}</span>
      <span>Request: {version.requestId}</span>
      {version.validation.warnings.map((warning) => <small key={warning}>{warning}</small>)}
    </div>
  );
}

function VersionActions({ version, onCode, onReview }: {
  version: SvgLoadedVersion; onCode: (version: SvgLoadedVersion) => void;
  onReview: (version: number, decision: SvgReviewDecision) => void;
}) {
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" disabled={!version.available} onClick={() => onCode(version)}>View code</button>
      <button type="button" className="svg-btn success" disabled={!version.available} onClick={() => onReview(version.version, "approved")}>Approve version</button>
      <button type="button" className="svg-btn danger" disabled={!version.available} onClick={() => onReview(version.version, "declined")}>Decline version</button>
      <button type="button" className="svg-btn" disabled={!version.available} onClick={() => onReview(version.version, "pending")}>Reset review</button>
      {!version.sourceCurrent && <small className="svg-warning-copy">Source fingerprint changed; historical output only.</small>}
    </div>
  );
}

function usageLabel(tokens: number | null, cost: number | null): string {
  const tokenLabel = tokens === null ? "usage not reported" : `${tokens.toLocaleString()} tokens`;
  const costLabel = cost === null ? "cost not reported" : `$${cost.toFixed(5)} actual`;
  return `${tokenLabel} · ${costLabel}`;
}

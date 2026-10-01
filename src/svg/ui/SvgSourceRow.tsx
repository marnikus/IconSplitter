// ui/SvgSourceRow.tsx — accessible one-file row with AI/SVG previews, durable
// state, shared Requesty usage, independent version actions and check selection.

import type { CSSProperties, MouseEvent } from "react";
import type { DirHandleLike } from "../../lib/fs";
import type { SvgSourceRow as SourceRow, SvgReviewDecision } from "../types";
import SvgPreview from "./SvgPreview";

interface SvgRowProps {
  row: SourceRow;
  root: { current: DirHandleLike | null };
  active: boolean;
  checked: boolean;
  generation: SourceRow["generation"];
  thumbHeight: number;
  busy: boolean;
  onSelect: () => void;
  onCheck: () => void;
  onGenerate: () => void;
  onReview: (decision: SvgReviewDecision) => void;
  onCode: () => void;
  onHistory: () => void;
  onRecover: () => void;
}

export default function SvgSourceRow({ row, root, active, checked, generation, thumbHeight, busy, ...actions }: SvgRowProps) {
  const style = { "--svg-thumb": `${thumbHeight}px` } as CSSProperties;
  return (
    <article role="listitem" aria-current={active ? "true" : undefined} tabIndex={active ? 0 : -1}
      className={rowClass(active, checked)} style={style} data-testid={`svg-row-${row.pairId}`} onClick={(e) => rowClick(e, actions.onSelect)}>
      <input type="checkbox" checked={checked} data-testid={`svg-check-${row.pairId}`}
        aria-label={`Select ${row.filename} for SVG actions`} onClick={(e) => e.stopPropagation()} onChange={actions.onCheck} />
      <SvgPreview root={root} path={row.relativePath} svg={row.newestSvg} alt={row.filename} />
      <FileCell row={row} />
      <StatusCell label={generationLabel(generation)} tone={generationTone(generation)} />
      <StatusCell label={titleCase(row.review)} tone={row.review} />
      <UsageCell row={row} />
      <FileActions row={row} onCode={actions.onCode} onHistory={actions.onHistory} onRecover={actions.onRecover} />
      <DecisionActions row={row} generation={generation} busy={busy} onGenerate={actions.onGenerate} onReview={actions.onReview} />
    </article>
  );
}

function rowClass(active: boolean, checked: boolean): string {
  return `svg-row${active ? " active" : ""}${checked ? " checked" : ""}`;
}

function rowClick(event: MouseEvent<HTMLElement>, select: () => void): void {
  if (event.target instanceof Element && event.target.closest("button,input")) return;
  select();
}

function FileCell({ row }: { row: SourceRow }) {
  return (
    <div className="svg-file-cell">
      <strong title={row.filename}>{row.filename}</strong>
      <code title={row.relativePath}>{row.relativePath}</code>
      <span className={row.safeError ? "svg-error-copy" : "svg-persist-copy"}>
        {row.safeError ?? (row.sidecarState === "ok" ? "Per-file sidecar saved" : "No SVG metadata yet")}
      </span>
    </div>
  );
}

function StatusCell({ label, tone }: { label: string; tone: string }) {
  return <div><span className={`svg-badge ${tone}`}>{label}</span></div>;
}

function UsageCell({ row }: { row: SourceRow }) {
  const version = row.versions.find((item) => item.version === row.newestVersion);
  const tokens = version?.usage.totalTokens;
  const cost = version?.usage.actualCostUsd;
  return (
    <div className="svg-usage-cell">
      <strong>{version ? `v${version.version}` : "—"}</strong>
      <span>{tokens === null || tokens === undefined ? "Usage not reported" : `${tokens.toLocaleString()} tokens · shared batch`}</span>
      <span>{cost === null || cost === undefined ? "Cost not reported" : `$${cost.toFixed(5)} actual · shared`}</span>
    </div>
  );
}

function FileActions({ row, onCode, onHistory, onRecover }: Pick<SvgRowProps, "row" | "onCode" | "onHistory" | "onRecover">) {
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" disabled={!row.newestSvg} onClick={onCode}>View code</button>
      <button type="button" className="svg-btn tiny" disabled={row.versions.length === 0 && row.requests.length === 0} onClick={onHistory}>History</button>
      {row.recoverableTempPath && <button type="button" className="svg-btn tiny" onClick={onRecover}>Retry save</button>}
    </div>
  );
}

function DecisionActions({ row, generation, busy, onGenerate, onReview }: Pick<SvgRowProps, "row" | "generation" | "busy" | "onGenerate" | "onReview">) {
  const hasOrphanOutput = row.versions.length > 0 || Boolean(row.recoverableTempPath);
  const canGenerate = !busy && !row.recoverableTempPath && !["generating", "unknown", "corrupt"].includes(generation)
    && (row.sidecarState === "ok" || !hasOrphanOutput);
  const canReview = Boolean(row.newestSvg) && generation !== "generating" && row.sidecarState === "ok";
  return (
    <div className="svg-row-actions">
      <button type="button" className="svg-btn primary tiny" disabled={!canGenerate} onClick={onGenerate}>
        {row.versions.length ? "Regenerate" : "Generate"}
      </button>
      <button type="button" className="svg-btn success tiny" disabled={!canReview} onClick={() => onReview("approved")}>Approve</button>
      <button type="button" className="svg-btn danger tiny" disabled={!canReview} onClick={() => onReview("declined")}>Decline</button>
    </div>
  );
}

function generationLabel(value: SourceRow["generation"]): string {
  const labels: Record<SourceRow["generation"], string> = {
    pending: "Not generated", generating: "Generating", generated: "Generated", recovered: "Recovered",
    recoverable: "Recoverable", failed: "Failed", unknown: "Unknown — check Requesty", corrupt: "Metadata corrupt",
  };
  return labels[value];
}

function generationTone(value: SourceRow["generation"]): string {
  if (["generated", "recovered"].includes(value)) return "approved";
  if (value === "generating") return "generating";
  if (["failed", "corrupt"].includes(value)) return "declined";
  if (value === "unknown" || value === "recoverable") return "warning";
  return "pending";
}

function titleCase(value: SvgReviewDecision): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

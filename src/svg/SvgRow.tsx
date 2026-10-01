// SvgRow.tsx — one approved source per row (prompt §2/§16): checkbox, the AI
// thumbnail beside the newest valid SVG preview, file identity + relative
// path, generation status, review status, version/tokens/cost, the file
// actions (location, copy, code, history) and the row's own Generate /
// Approve / Decline. Every code action stays disabled until a valid SVG
// exists, and the active row is visually distinct from a merely checked one.

import { useEffect, useRef } from "react";
import type { ReviewStatus } from "../lib/svgfile";
import { costLabel, fmtCost, fmtTokens } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import SvgThumbs from "./SvgThumbs";
import type { SvgRow } from "./types";

export interface SvgRowActions {
  activeId: string | null;
  checked: string[];
  thumb: number;
  rootRef: { current: DirHandleLike | null };
  toggleCheck: (id: string) => void;
  setActive: (id: string) => void;
  generate: (ids: string[]) => void;
  decide: (ids: string[], decision: ReviewStatus) => void;
  copyCode: (id: string, version: number) => void;
  showCode: (id: string, version: number) => void;
  showHistory: (id: string) => void;
  openLocation: (id: string) => void;
}

export default function SvgRowView({ row, a }: { row: SvgRow; a: SvgRowActions }) {
  const active = row.source.id === a.activeId;
  const checked = a.checked.includes(row.source.id);
  const ref = useActiveScroll(active);
  const id = row.source.id;
  return (
    <div ref={ref} role="listitem" data-testid={`svg-row-${id}`} tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined}
      className={`svg-row ${row.newest?.review ?? "pending"}${active ? " active" : ""}${checked ? " selected" : ""}${row.corrupt ? " corrupt" : ""}`}
      onClick={() => a.setActive(id)}>
      <input type="checkbox" className="svg-check" data-testid={`svg-check-${id}`} checked={checked}
        aria-label={`Select ${row.source.name}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(id)} />
      <SvgThumbs rootRef={a.rootRef} row={row} thumb={a.thumb} />
      <FileCell row={row} />
      <StatusCell row={row} />
      <ReviewCell row={row} />
      <UsageCell row={row} />
      <FileActions row={row} a={a} />
      <DecisionActions row={row} a={a} />
    </div>
  );
}

/** Location / copy / code / history — all disabled until a version exists. */
function FileActions({ row, a }: { row: SvgRow; a: SvgRowActions }) {
  const id = row.source.id;
  const version = row.newest?.version ?? 0;
  const hasSvg = row.newest !== null;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`svg-location-${id}`}
        onClick={click(() => a.openLocation(id))}>Location</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-copy-${id}`} disabled={!hasSvg}
        onClick={click(() => a.copyCode(id, version))}>Copy</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-code-${id}`} disabled={!hasSvg}
        onClick={click(() => a.showCode(id, version))}>Code</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-history-${id}`} disabled={(row.sidecar?.versions.length ?? 0) === 0}
        onClick={click(() => a.showHistory(id))}>History</button>
    </div>
  );
}

/** The row's own generate/regenerate and its approve/decline pair. */
function DecisionActions({ row, a }: { row: SvgRow; a: SvgRowActions }) {
  const id = row.source.id;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-decision-actions">
      <button type="button" className="svg-btn tiny primary" data-testid={`svg-generate-${id}`}
        onClick={click(() => a.generate([id]))}>{row.newest ? "Regenerate" : "Generate"}</button>
      <button type="button" className="svg-btn tiny success" data-testid={`svg-approve-${id}`} disabled={row.newest === null}
        onClick={click(() => a.decide([id], "approved"))}>✓</button>
      <button type="button" className="svg-btn tiny danger" data-testid={`svg-decline-${id}`} disabled={row.newest === null}
        onClick={click(() => a.decide([id], "declined"))}>✕</button>
    </div>
  );
}

/** Keeps the active row in view while the arrow keys walk the list. */
function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}

function FileCell({ row }: { row: SvgRow }) {
  const target = row.newest?.svgPath || `${row.source.stem}.svg.json`;
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={row.source.name}>{row.source.name}</div>
      <div className="svg-file-sub" title={target}>{row.source.dirPath === "" ? "./" : `${row.source.dirPath}/`}{target}</div>
      <div className={`svg-persist${row.corrupt ? " error" : ""}`} data-testid={`svg-persist-${row.source.id}`}>
        {row.corrupt ? "Sidecar unreadable — SVGs on disk are kept" : row.sidecar ? "Per-file sidecar saved" : "Not generated yet"}
      </div>
    </div>
  );
}

function StatusCell({ row }: { row: SvgRow }) {
  return (
    <div className="svg-cell" data-testid={`svg-status-${row.source.id}`}>
      <span className={`svg-badge ${row.status}`}>{label(row.status)}</span>
      {row.running && <span className="svg-progress-mini" aria-hidden="true"><span /></span>}
      {row.error !== null && <small className="svg-error" title={row.error}>{row.error}</small>}
    </div>
  );
}

function ReviewCell({ row }: { row: SvgRow }) {
  const review = row.newest?.review ?? "pending";
  return (
    <div className="svg-cell" data-testid={`svg-review-${row.source.id}`}>
      <span className={`svg-badge ${review}`}>{label(review)}</span>
      {row.approved !== null && <small>approved v{row.approved.version}</small>}
    </div>
  );
}

function UsageCell({ row }: { row: SvgRow }) {
  const v = row.newest;
  const usage = v ? { input: v.usage.input, output: v.usage.output, total: v.usage.total, cost: v.cost.actual, currency: v.cost.currency, estimated: v.cost.estimated } : null;
  return (
    <div className="svg-cell svg-usage" data-testid={`svg-usage-${row.source.id}`}>
      <strong>{v ? `v${v.version}` : "—"}</strong>
      {usage === null ? <small>no usage</small> : <small>{fmtTokens(usage.total)} tokens</small>}
      {usage === null ? <small>{fmtCost(null)}</small> : <small>{costLabel(usage)}</small>}
    </div>
  );
}

/** "not-generated" -> "Not generated" for badges. */
function label(value: string): string {
  return value.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

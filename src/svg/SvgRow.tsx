// SvgRow.tsx — one approved source per row (prompt §2/§16): checkbox, the AI
// thumbnail beside the SVG the row SHOWS — the user's chosen version when there
// is one, else the newest valid (I-54) — file identity + relative path,
// generation status, review status, version/tokens/cost, the file actions
// (location, copy, code, history) and the row's own Generate / Approve /
// Decline. Every reader asks `shownVersion`, so the badge, the preview, Copy
// and the buttons can never disagree. Every code action stays disabled until a
// valid SVG exists, and the active row is visually distinct from a merely
// checked one.

import { useEffect, useRef } from "react";
import type { ReviewStatus } from "../lib/svgfile";
import type { PreviewBackground } from "../lib/svgbackground";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { previewTargetOf, shownVersion, targetPathOf } from "./rowmodel";
import SvgThumbs from "./SvgThumbs";
import { PROBLEM_LABEL, type SvgSource } from "./sources";
import type { SvgRow } from "./types";

export interface SvgRowActions {
  activeId: string | null;
  checked: string[];
  thumb: number;
  bg: PreviewBackground;
  /** Bumped by every pick and scan so the SVG preview re-reads its file. */
  rootToken: number;
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
  const shown = shownVersion(row);
  return (
    <div ref={ref} role="listitem" data-testid={`svg-row-${id}`} tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined}
      className={`svg-row ${shown?.review ?? "pending"}${active ? " active" : ""}${checked ? " selected" : ""}${row.corrupt ? " corrupt" : ""}`}
      onClick={() => a.setActive(id)}>
      <input type="checkbox" className="svg-check" data-testid={`svg-check-${id}`} checked={checked}
        aria-label={`Select ${row.source.name}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(id)} />
      <SvgThumbs rootRef={a.rootRef} rootToken={a.rootToken} row={row} thumb={a.thumb} bg={a.bg} />
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
  // The version Copy hands out is the version the preview shows — one owner.
  const target = previewTargetOf(row);
  const version = target?.version ?? 0;
  const hasSvg = target !== null;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`svg-location-${id}`}
        onClick={click(() => a.openLocation(id))}>Location</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-copy-${id}`} disabled={!hasSvg}
        onClick={click(() => a.copyCode(id, version))}>Copy</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-code-${id}`} disabled={!hasSvg}
        onClick={click(() => a.showCode(id, version))}>Code</button>
      <button type="button" className="svg-btn tiny" data-testid={`svg-history-${id}`} disabled={(row.meta?.versions.length ?? 0) === 0}
        onClick={click(() => a.showHistory(id))}>Versions</button>
    </div>
  );
}

/** The row's own generate/regenerate and its approve/decline pair. */
function DecisionActions({ row, a }: { row: SvgRow; a: SvgRowActions }) {
  const id = row.source.id;
  const shown = shownVersion(row); // approve/decline act on what the row shows (I-54)
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-decision-actions">
      <button type="button" className="svg-btn tiny primary" data-testid={`svg-generate-${id}`}
        onClick={click(() => a.generate([id]))}>{row.newest ? "Regenerate" : "Generate"}</button>
      <button type="button" className="svg-btn tiny success" data-testid={`svg-approve-${id}`} disabled={shown === null}
        onClick={click(() => a.decide([id], "approved"))}>✓</button>
      <button type="button" className="svg-btn tiny danger" data-testid={`svg-decline-${id}`} disabled={shown === null}
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
  const target = targetPathOf(row); // the ONE file a row is about (I-56)
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={row.source.name}>{row.source.name}</div>
      <div className="svg-file-sub" data-testid={`svg-target-${row.source.id}`} title={target}>{target}</div>
      <ProblemLine row={row} />
      <div className={`svg-persist${row.corrupt ? " error" : ""}`} data-testid={`svg-persist-${row.source.id}`}
        title={pairFilePathOf(row.source)}>
        {row.corrupt ? "Pair file unreadable — SVGs on disk are kept" : row.meta ? "Pair file saved" : "Not generated yet"}
      </div>
    </div>
  );
}

/**
 * What the scan could not fully use, on the row itself (design D8): one status
 * line per reason, so a pair that needs attention is never just a count in a
 * banner and never silently absent from the list.
 */
function ProblemLine({ row }: { row: SvgRow }) {
  if (row.source.problems.length === 0) return null;
  return (
    <div className="svg-file-problem" data-testid={`svg-problem-${row.source.id}`}
      title={row.source.problems.map((p) => p.reason).join(" · ")}>
      {row.source.problems.map((p) => PROBLEM_LABEL[p.kind]).join(" · ")}
    </div>
  );
}

/** The pair file beside that SVG — the file the persist line reports. */
function pairFilePathOf(source: SvgSource): string {
  return source.metaPath;
}

/** "." for the root, so a row never shows a stray leading slash. */
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
  const review = shownVersion(row)?.review ?? "pending";
  return (
    <div className="svg-cell" data-testid={`svg-review-${row.source.id}`}>
      <span className={`svg-badge ${review}`}>{label(review)}</span>
      {row.approved !== null && <small>approved v{row.approved.version}</small>}
    </div>
  );
}

/** Version, tokens and cost of the newest version — reported or Estimated. */
function UsageCell({ row }: { row: SvgRow }) {
  const v = shownVersion(row);
  return (
    <div className="svg-cell svg-usage" data-testid={`svg-usage-${row.source.id}`}>
      <strong>{v ? `v${v.version}` : "—"}</strong>
      {v === null
        ? <small>no usage</small>
        : <small>{fmtTokens(v.usage.total)} tokens</small>}
      <small title={v === null ? undefined : costNote(v.model, v.cost)}>
        {v === null ? costLabel({ actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" }) : costLabel(v.cost)}
      </small>
    </div>
  );
}

/** "not-generated" -> "Not generated" for badges. */
function label(value: string): string {
  return value.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

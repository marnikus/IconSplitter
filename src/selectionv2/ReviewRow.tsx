// ReviewRow.tsx — one image pair per row (spec V2 §3): checkbox, both
// thumbnails, file identity, created stamp, dimensions, status with glyph and
// text, per-side open actions and the row's own Approve/Decline. The row is
// the active-row target (`aria-current`) and stays visually distinct from a
// merely checked row.

import { useEffect, useRef, useState } from "react";
import { attentionInfo } from "../lib/pairing";
import type { Decision, ViewPair } from "../lib/reviewfilter";
import { statusInfo } from "../lib/reviewmeta";
import { fmtBytes, fmtDate, fmtFormat, fmtTime } from "../selection/fmt";
import ThumbPair, { type Dims } from "./ThumbPair";
import type { ReviewListProps } from "./ReviewList";

export default function ReviewRow({ row, p }: { row: ViewPair; p: ReviewListProps }) {
  const active = row.pairId === p.activeId;
  const checked = p.checked.includes(row.pairId);
  const [dims, setDims] = useState<Dims | null>(null);
  const ref = useActiveScroll(active);
  return (
    <div ref={ref} role="listitem" data-testid={`v2-row-${row.pairId}`} tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined} className={rowClass(row.decision, active, checked)}
      onClick={(e) => p.onRowClick(row.pairId, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey })}>
      <input type="checkbox" className="v2-check" data-testid={`v2-check-${row.pairId}`} checked={checked}
        aria-label={`Select ${row.base}`} title="Ctrl+click a row to add it, Shift+click to select a range"
        onClick={(e) => e.stopPropagation()} onChange={() => p.toggleCheck(row.pairId)} />
      <ThumbPair row={row} maxH={p.thumb} thumbFor={p.thumbFor} onDims={setDims} />
      <FileCell row={row} />
      <div className="v2-cell" data-testid={`v2-created-${row.pairId}`}>{fmtDate(row.created)}<small>{fmtTime(row.created)} local</small></div>
      <DimsCell row={row} dims={dims} />
      <StatusCell row={row} />
      <OpenCell row={row} openSide={p.openSide} />
      <div className="v2-decision-actions">
        <button type="button" className="v2-btn tiny danger" data-testid={`v2-decline-${row.pairId}`}
          onClick={() => p.decide(row.pairId, "declined")}>✕ Decline</button>
        <button type="button" className="v2-btn tiny success" data-testid={`v2-approve-row-${row.pairId}`}
          onClick={() => p.decide(row.pairId, "approved")}>✓ Approve</button>
      </div>
    </div>
  );
}

function rowClass(decision: Decision, active: boolean, checked: boolean): string {
  return `v2-row ${decision}${active ? " active" : ""}${checked ? " selected" : ""}`;
}

/** Keeps the active row in view while arrow keys walk the list (spec V2 §7). */
function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}

function FileCell({ row }: { row: ViewPair }) {
  const name = (row.source ?? row.ai)?.relPath.split("/").pop() ?? row.base;
  const aiPath = row.ai?.relPath ?? `${row.relDir || "/"}/ — AI result missing`;
  return (
    <div className="v2-file-main">
      <div className="v2-file-name" title={name}>{name}</div>
      <div className="v2-file-sub" title={aiPath}>{aiPath} · {row.pairId}</div>
    </div>
  );
}

function DimsCell({ row, dims }: { row: ViewPair; dims: Dims | null }) {
  const side = row.source ?? row.ai;
  const size = dims ? `${dims.w} × ${dims.h}` : "dimensions on load";
  return (
    <div className="v2-cell" data-testid={`v2-dims-${row.pairId}`}>
      {size} · {side ? fmtFormat(side.relPath) : "?"}
      <small>{side ? fmtBytes(side.size) : "no file"}</small>
    </div>
  );
}

function StatusCell({ row }: { row: ViewPair }) {
  const warn = attentionInfo(row);
  const meta = statusInfo(row.decision);
  const text = warn ? `⚠ ${warn}` : `${meta.glyph} ${meta.label}`;
  return (
    <div className="v2-cell">
      <span className={`v2-badge ${warn ? "attention" : row.decision}`} data-testid={`v2-status-${row.pairId}`}>{text}</span>
    </div>
  );
}

function OpenCell({ row, openSide }: { row: ViewPair; openSide: (relPath: string) => void }) {
  return (
    <div className="v2-file-actions">
      <button type="button" className="v2-btn tiny" data-testid={`v2-open-src-${row.pairId}`} disabled={!row.source}
        onClick={() => row.source && openSide(row.source.relPath)}>Original</button>
      <button type="button" className="v2-btn tiny" data-testid={`v2-open-ai-${row.pairId}`} disabled={!row.ai}
        onClick={() => row.ai && openSide(row.ai.relPath)}>AI result</button>
    </div>
  );
}

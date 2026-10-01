// BulkBar.tsx — the bulk review bar (spec V2 §5/§6 + request §2): header
// checkbox with an indeterminate state, the selected/visible scope, select-
// visible and deselect-all, the thumbnail zoom slider, and the bulk actions —
// approve and reset-to-pending, each for the checked rows or the whole visible
// list. Every action carries its affected count and arms before applying, so
// the number of affected items is visible before anything is written.

import { useEffect, useState } from "react";
import type { CheckState } from "../lib/reviewselect";
import ZoomSlider from "./ZoomSlider";

export type BulkScope = "selected" | "visible";

export interface BulkBarProps {
  header: CheckState;
  checkedCount: number;
  affectedCount: number;
  resetCount: number; // checked + visible + reviewed — what reset selected changes
  pendingChecked: number; // checked + visible but already pending — reported, never reset
  blockedCount: number;
  hiddenCount: number;
  visibleCount: number;
  visibleResetCount: number; // every reviewed pair in the visible list
  thumb: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onApprove: (scope: BulkScope) => void;
  onReset: (scope: BulkScope) => void;
}

export default function BulkBar(p: BulkBarProps) {
  const [armed, setArmed] = useState<string | null>(null);
  useEscape(() => setArmed(null), armed !== null);
  return (
    <div className="v2-bulk" data-testid="v2-bulk">
      <BulkLeft p={p} />
      <div className="v2-bulk-right">
        <ZoomSlider value={p.thumb} onChange={p.onThumb} />
        <span className="v2-divider" aria-hidden="true" />
        {armed && (
          <button type="button" className="v2-btn ghost" data-testid="v2-cancel-bulk" onClick={() => setArmed(null)}>
            Cancel
          </button>
        )}
        <ArmBtn id="approve-selected" label="Approve selected" count={p.affectedCount} armed={armed} setArmed={setArmed} run={p.onApprove} />
        <ArmBtn id="approve-visible" label="Approve visible list" count={p.visibleCount} solid armed={armed} setArmed={setArmed} run={p.onApprove} />
        <ArmBtn id="reset-selected" label="Reset selected to pending" count={p.resetCount} tone="warn" armed={armed} setArmed={setArmed} run={p.onReset} />
        <ArmBtn id="reset-visible" label="Reset visible list to pending" count={p.visibleResetCount} tone="warn" armed={armed} setArmed={setArmed} run={p.onReset} />
      </div>
    </div>
  );
}

function BulkLeft({ p }: { p: BulkBarProps }) {
  return (
    <div className="v2-bulk-left">
      <input type="checkbox" data-testid="v2-check-all" aria-label="Select all visible image pairs"
        checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)}
        ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
      <span className="v2-selected-copy" data-testid="v2-selected-count">{p.checkedCount} selected</span>
      <span className="v2-scope-copy" data-testid="v2-scope">across {p.visibleCount} visible pairs</span>
      <span className="v2-scope-copy" data-testid="v2-reset-scope">{p.resetCount} resettable</span>
      {p.pendingChecked > 0 && (
        <span className="v2-scope-copy" data-testid="v2-pending-checked">{p.pendingChecked} checked already pending</span>
      )}
      {p.blockedCount > 0 && (
        <span className="v2-scope-copy warn" data-testid="v2-blocked">{p.blockedCount} checked pair{p.blockedCount === 1 ? "" : "s"} incomplete — never approved</span>
      )}
      {p.hiddenCount > 0 && (
        <span className="v2-scope-copy warn" data-testid="v2-hidden">{p.hiddenCount} checked but hidden by filters</span>
      )}
      <span className="v2-divider" aria-hidden="true" />
      <button type="button" className="v2-btn" data-testid="v2-select-visible" onClick={p.onSelectVisible}>Select visible</button>
      <button type="button" className="v2-btn" data-testid="v2-deselect" onClick={p.onDeselectAll}>Deselect all</button>
    </div>
  );
}

/** One armable bulk action: first click arms with the count, second applies. */
function ArmBtn({ id, label, count, armed, setArmed, run, solid, tone }: {
  id: string; label: string; count: number; armed: string | null;
  setArmed: (s: string | null) => void; run: (s: BulkScope) => void; solid?: boolean; tone?: "warn";
}) {
  const isArmed = armed === id;
  const scope: BulkScope = id.endsWith("visible") ? "visible" : "selected";
  const click = () => {
    if (!isArmed) return setArmed(id);
    setArmed(null);
    run(scope);
  };
  return (
    <button type="button" data-testid={`v2-${id}`} disabled={count === 0} onClick={click}
      className={`v2-btn ${tone === "warn" ? "" : "success"}${solid ? " solid" : ""}${isArmed ? " armed" : ""}`}
      aria-label={`${label} — ${count} ${count === 1 ? "pair" : "pairs"}`}>
      {isArmed ? `Confirm ${verbOf(id)} ${count}?` : `${id.startsWith("reset") ? "↺" : "✓"} ${label} (${count})`}
    </button>
  );
}

function verbOf(id: string): string {
  return id.startsWith("reset") ? "reset" : "approve";
}

/** Escape disarms a pending bulk confirmation (keyboard parity, a11y §14). */
function useEscape(onEscape: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}

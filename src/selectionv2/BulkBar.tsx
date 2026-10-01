// BulkBar.tsx — the bulk review bar (spec V2 §5/§6): header checkbox with an
// indeterminate state, the selected/visible scope, select-visible and
// deselect-all, the thumbnail zoom slider, the two approve actions and the two
// reset-to-pending actions. Every bulk button carries its count and arms before
// applying, so the number of affected items is visible before anything is
// written, and each press is ONE undoable action.

import { useEffect, useState } from "react";
import type { CheckState } from "../lib/reviewselect";
import ZoomSlider from "./ZoomSlider";

export type BulkScope = "selected" | "visible";

export interface BulkBarProps {
  header: CheckState;
  checkedCount: number;
  affectedCount: number;
  blockedCount: number;
  hiddenCount: number;
  visibleCount: number;
  thumb: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onApprove: (scope: BulkScope) => void;
  onReset: (scope: BulkScope) => void;
}

export default function BulkBar(p: BulkBarProps) {
  const [armed, setArmed] = useState<BulkScope | null>(null);
  const [armReset, setArmReset] = useState<BulkScope | null>(null);
  useEscape(() => { setArmed(null); setArmReset(null); }, armed !== null || armReset !== null);
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
        <ResetBtn scope="selected" label="Reset selected" count={p.affectedCount} armed={armReset} setArmed={setArmReset} onReset={p.onReset} />
        <ResetBtn scope="visible" label="Reset visible list" count={p.visibleCount} armed={armReset} setArmed={setArmReset} onReset={p.onReset} />
        <span className="v2-divider" aria-hidden="true" />
        <ApproveBtn scope="selected" label="Approve selected" count={p.affectedCount} armed={armed} setArmed={setArmed} onApprove={p.onApprove} />
        <ApproveBtn scope="visible" solid label="Approve visible list" count={p.visibleCount} armed={armed} setArmed={setArmed} onApprove={p.onApprove} />
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

interface ApproveBtnProps {
  scope: BulkScope;
  label: string;
  count: number;
  solid?: boolean;
  armed: BulkScope | null;
  setArmed: (s: BulkScope | null) => void;
  onApprove: (s: BulkScope) => void;
}

function ApproveBtn(p: ApproveBtnProps) {
  const isArmed = p.armed === p.scope;
  const click = () => {
    if (isArmed) {
      p.setArmed(null);
      p.onApprove(p.scope);
      return;
    }
    p.setArmed(p.scope);
  };
  return (
    <button type="button" data-testid={`v2-approve-${p.scope}`} disabled={p.count === 0} onClick={click}
      className={`v2-btn success${p.solid ? " solid" : ""}${isArmed ? " armed" : ""}`}
      aria-label={`${p.label} — ${p.count} ${p.count === 1 ? "pair" : "pairs"}`}>
      {isArmed ? `Confirm approve ${p.count}?` : `✓ ${p.label} (${p.count})`}
    </button>
  );
}

interface ResetBtnProps {
  scope: BulkScope;
  label: string;
  count: number;
  armed: BulkScope | null;
  setArmed: (s: BulkScope | null) => void;
  onReset: (s: BulkScope) => void;
}

/** Reset to pending — undoable, and honest about how many pairs it touches. */
function ResetBtn(p: ResetBtnProps) {
  const isArmed = p.armed === p.scope;
  const click = () => {
    if (isArmed) {
      p.setArmed(null);
      p.onReset(p.scope);
      return;
    }
    p.setArmed(p.scope);
  };
  return (
    <button type="button" data-testid={`v2-reset-${p.scope}`} disabled={p.count === 0} onClick={click}
      className={`v2-btn${isArmed ? " armed" : ""}`}
      title="Returns approved or declined pairs to pending. Undoable."
      aria-label={`${p.label} — ${p.count} ${p.count === 1 ? "pair" : "pairs"}`}>
      {isArmed ? `Confirm reset ${p.count}?` : `↺ ${p.label} (${p.count})`}
    </button>
  );
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

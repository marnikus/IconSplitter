// BulkBar.tsx — the bulk review bar (spec V2 §5/§6): header checkbox with an
// indeterminate state, the selected/visible scope, select-visible and
// deselect-all, the thumbnail zoom slider, and the three bulk actions.
//
// Every action applies to the SELECTION only — there is no "visible list"
// action, so a bulk operation can never touch a row the user did not select.
// Each button carries its count and arms before applying, so the number of
// affected items is visible before anything is written, and each press is ONE
// undoable action.

import { useEffect, useState } from "react";
import type { CheckState } from "../lib/reviewselect";
import type { Decision } from "../lib/reviewfilter";
import ZoomSlider from "../ui/ZoomSlider";

export type BulkAction = "approve" | "decline" | "reset";

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
  onDecide: (decision: Decision) => void;
  onReset: () => void;
}

interface ActionSpec {
  action: BulkAction;
  label: string;
  /** Glyph-free name for assistive tech. */
  name: string;
  confirm: string;
  cls: string;
}

const ACTIONS: ActionSpec[] = [
  { action: "approve", label: "✓ Approve selected", name: "Approve selected", confirm: "Confirm approve", cls: " success" },
  { action: "decline", label: "✕ Decline selected", name: "Decline selected", confirm: "Confirm decline", cls: " danger" },
  { action: "reset", label: "↺ Reset selected", name: "Reset selected to pending", confirm: "Confirm reset", cls: "" },
];

export default function BulkBar(p: BulkBarProps) {
  const [armed, setArmed] = useState<BulkAction | null>(null);
  useEscape(() => setArmed(null), armed !== null);
  return (
    <div className="v2-bulk" data-testid="v2-bulk">
      <BulkLeft p={p} />
      <div className="v2-bulk-right">
        <ZoomSlider id="v2-thumb" className="v2-zoom" value={p.thumb} onChange={p.onThumb} />
        <span className="v2-divider" aria-hidden="true" />
        {armed && (
          <button type="button" className="v2-btn ghost" data-testid="v2-cancel-bulk" onClick={() => setArmed(null)}>
            Cancel
          </button>
        )}
        {ACTIONS.map((a) => (
          <BulkBtn key={a.action} spec={a} count={p.affectedCount} armed={armed} setArmed={setArmed} run={() => runAction(p, a.action)} />
        ))}
      </div>
    </div>
  );
}

function runAction(p: BulkBarProps, action: BulkAction): void {
  if (action === "approve") p.onDecide("approved");
  else if (action === "decline") p.onDecide("declined");
  else p.onReset();
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

interface BulkBtnProps {
  spec: ActionSpec;
  count: number;
  armed: BulkAction | null;
  setArmed: (a: BulkAction | null) => void;
  run: () => void;
}

function BulkBtn({ spec, count, armed, setArmed, run }: BulkBtnProps) {
  const isArmed = armed === spec.action;
  const click = () => {
    if (!isArmed) return setArmed(spec.action);
    setArmed(null);
    run();
  };
  return (
    <button type="button" data-testid={`v2-${spec.action}-selected`} disabled={count === 0} onClick={click}
      className={`v2-btn${spec.cls}${isArmed ? " armed" : ""}`}
      title={spec.action === "reset" ? "Back to pending — undoable" : "Applies to the selected rows only"}
      aria-label={`${spec.name} — ${count} ${count === 1 ? "pair" : "pairs"}`}>
      {isArmed ? `${spec.confirm} ${count}?` : `${spec.label} (${count})`}
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

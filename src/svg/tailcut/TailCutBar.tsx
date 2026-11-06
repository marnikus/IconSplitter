// TailCutBar.tsx — the tail cutter in Generate SVG's bulk bar (2026-11-06):
// "✂ Cut tails" on the checked rows (auto-cut, or review with highlights),
// "✓ Approve cuts (n)" for the checked rows that were reviewed, and the
// "Cutter algo" settings popup: tolerance (the icon's px), highlight colour and
// padding (screen px), auto-cut.

import { useRef, useState } from "react";
import { useDismiss } from "../../ui/usedismiss";
import { PADDING_MAX, TOLERANCE_MAX, TOLERANCE_MIN, setCutSettings, useCutSettings } from "./cutsettings";
import { reviewedWithTails, useTailReviews } from "./tailreview";

export interface TailCutBarProps {
  checked: readonly string[];
  onRun: () => void;
  onApprove: () => void;
}

export default function TailCutBar({ checked, onRun, onApprove }: TailCutBarProps) {
  useTailReviews();
  const { auto } = useCutSettings();
  const approvable = reviewedWithTails(checked).length;
  return (
    <>
      <button type="button" className="svg-btn" data-testid="svg-cut-run" disabled={checked.length === 0} onClick={onRun}
        title={auto ? "Find and cut the small tails of lines poking through other lines — checked rows, one undo step"
          : "Find the small tails of lines poking through other lines and highlight them on the checked rows — nothing is cut yet"}>
        ✂ Cut tails{auto ? " (auto)" : ""}
      </button>
      <button type="button" className="svg-btn success" data-testid="svg-cut-approve" disabled={approvable === 0} onClick={onApprove}
        title="Cut the highlighted tails on the checked, reviewed rows — one undo step">✓ Approve cuts ({approvable})</button>
      <CutterSettingsButton />
    </>
  );
}

function CutterSettingsButton() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(box, open, close);
  return (
    <div className="svg-edit-settings" ref={box}>
      <button type="button" className="svg-btn" data-testid="svg-cut-settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⚙ Cutter algo</button>
      {open && <CutterSettings onClose={close} />}
    </div>
  );
}

function CutterSettings({ onClose }: { onClose: () => void }) {
  const s = useCutSettings();
  return (
    <div className="svg-edit-settings-pop" role="dialog" aria-label="Cutter algo" data-testid="svg-cut-settings-dialog">
      <label className="svg-field">
        <span className="svg-label">Tail tolerance (icon px)</span>
        <input className="svg-input" type="number" min={TOLERANCE_MIN} max={TOLERANCE_MAX} step={0.5} data-testid="svg-cut-tolerance"
          value={s.tolerancePx} onChange={(e) => setCutSettings({ tolerancePx: Number(e.target.value) })} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Highlight colour</span>
        <input type="color" data-testid="svg-cut-color" value={s.color} onChange={(e) => setCutSettings({ color: e.target.value })} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Highlight padding (screen px)</span>
        <input className="svg-input" type="number" min={0} max={PADDING_MAX} step={1} data-testid="svg-cut-padding"
          value={s.paddingPx} onChange={(e) => setCutSettings({ paddingPx: Number(e.target.value) })} />
      </label>
      <label className="svg-field-check">
        <input type="checkbox" data-testid="svg-cut-auto" checked={s.auto} onChange={(e) => setCutSettings({ auto: e.target.checked })} />
        <span>Cut automatically (off: highlight first, then approve)</span>
      </label>
      <small>A tail is the bit of a line's open end that pokes past another line, at most the tolerance long (the icon's own units, e.g. of 1024).</small>
      <button type="button" className="svg-btn tiny" data-testid="svg-cut-settings-close" onClick={onClose}>Close</button>
    </div>
  );
}

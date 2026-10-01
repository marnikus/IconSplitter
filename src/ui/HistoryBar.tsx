// HistoryBar.tsx — the always-visible undo affordance (design doc §4): one global
// timeline, two buttons, and a History window that lists the changes behind them.
// It sits in the Workbench chrome so it is on screen for every tab, including
// the Sheets editor. The labels come from the entry under the cursor: "Undo:
// Approve pair_a" tells you what will be reversed before you do it.

import { useState } from "react";
import { useHistory } from "../state/HistoryProvider";
import HistoryPanel from "./HistoryPanel";

const BTN = "rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-200 transition"
  + " enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function HistoryBar() {
  const h = useHistory();
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="history-bar" className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-2 py-1 text-sm">
      <StepButton testid="hist-undo" glyph="↶" text="Undo" hint="Ctrl+Z"
        label={h.undoLabel} enabled={h.canUndo} onClick={h.undo} />
      <StepButton testid="hist-redo" glyph="↷" text="Redo" hint="Ctrl+Shift+Z"
        label={h.redoLabel} enabled={h.canRedo} onClick={h.redo} />
      <span className="text-xs text-slate-400" data-testid="hist-label">
        {h.undoLabel ? `Undo: ${h.undoLabel}` : "Nothing to undo"}
      </span>
      <button type="button" data-testid="hist-open" onClick={() => setOpen(!open)} aria-expanded={open}
        aria-controls="hist-panel" className={BTN} title="Show the change history">
        History ({h.entries.length})
      </button>
      {h.error && <p role="alert" data-testid="hist-error" className="text-xs text-amber-300">{h.error}</p>}
      {open && <HistoryPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

interface StepProps {
  testid: string;
  glyph: string;
  text: string;
  hint: string;
  /** Label of the entry this button would reverse, null when there is none. */
  label: string | null;
  enabled: boolean;
  onClick: () => void;
}

function StepButton(p: StepProps) {
  return (
    <button type="button" data-testid={p.testid} onClick={p.onClick} disabled={!p.enabled} className={BTN}
      title={p.label ? `${p.text}: ${p.label} (${p.hint})` : `Nothing to ${p.text.toLowerCase()} (${p.hint})`}>
      <span aria-hidden="true">{p.glyph}</span> {p.text}
    </button>
  );
}

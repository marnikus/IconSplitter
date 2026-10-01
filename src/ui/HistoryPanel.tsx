// HistoryPanel.tsx — the History window (design doc §5): every recorded change,
// newest first, with the cursor marked and Undo/Redo beside it, so "what will the
// next redo bring back?" is visible rather than implied. The list is read-only:
// jumping to an arbitrary point would mean applying several entries at once,
// which this app cannot promise to do safely (a failed apply must never move the
// cursor).

import { useEffect } from "react";
import { fmtTime } from "../selection/fmt";
import { useHistory } from "../state/HistoryProvider";

const BTN = "rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-200 transition"
  + " enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function HistoryPanel({ onClose }: { onClose: () => void }) {
  const error = useHistory().error;
  useEscape(onClose);
  return (
    <aside
      data-testid="hist-panel" role="dialog" aria-label="History"
      className="fixed right-3 top-14 z-40 flex max-h-[80vh] w-80 flex-col rounded-xl border border-white/10 bg-slate-900 shadow-2xl"
    >
      <PanelHeader onClose={onClose} />
      <PanelActions />
      <EntryList />
      {error && (
        <p role="alert" data-testid="hist-panel-error" className="border-t border-white/10 px-3 py-2 text-xs text-amber-300">
          {error}
        </p>
      )}
    </aside>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  const count = useHistory().entries.length;
  return (
    <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
      <h2 className="text-sm font-semibold">History</h2>
      <span className="text-xs text-slate-400" data-testid="hist-panel-count">
        {count} {count === 1 ? "change" : "changes"}
      </span>
      <button type="button" data-testid="hist-close" onClick={onClose} aria-label="Close history"
        className="ml-auto rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100">✕</button>
    </header>
  );
}

function PanelActions() {
  const h = useHistory();
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
      <button type="button" data-testid="hist-panel-undo" onClick={h.undo} disabled={!h.canUndo} className={BTN}
        title={h.undoLabel ? `Undo: ${h.undoLabel}` : "Nothing to undo"}>↶ Undo</button>
      <button type="button" data-testid="hist-panel-redo" onClick={h.redo} disabled={!h.canRedo} className={BTN}
        title={h.redoLabel ? `Redo: ${h.redoLabel}` : "Nothing to redo"}>↷ Redo</button>
    </div>
  );
}

function EntryList() {
  const h = useHistory();
  const current = h.entries[h.index]?.id ?? null;
  return (
    <ul data-testid="hist-panel-items" className="flex-1 overflow-auto p-1 text-xs">
      {h.entries.length === 0 && <li className="p-2 text-slate-500">No changes yet</li>}
      {[...h.entries].reverse().map((e) => (
        <li key={e.id} data-testid={`hist-item-${e.id}`} data-current={current === e.id || undefined}
          className={`flex gap-2 rounded px-2 py-1 ${current === e.id ? "bg-indigo-500/20" : ""}`}>
          <span className="text-slate-500">{fmtTime(Date.parse(e.at))}</span>
          <span className="flex-1 truncate text-slate-200">{e.label}</span>
          <span className="text-slate-500">{e.origin}</span>
        </li>
      ))}
    </ul>
  );
}

function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

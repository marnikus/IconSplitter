// HistoryBar.tsx — the app-level undo/redo, in one consistent place above every
// tab (design doc §5): real disabled states, the next action named in the label
// and tooltip, and a compact list so the order an undo follows is visible.
// The list is read-only on purpose — jumping to an arbitrary point would mean
// applying several entries at once, which is not something this app can promise
// to do safely (a failed apply must never move the cursor).

import { fmtTime } from "../selection/fmt";
import { useHistory } from "../state/HistoryProvider";

const BTN = "rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-200 transition"
  + " enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function HistoryBar() {
  const h = useHistory();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="history-bar">
      <button
        type="button" data-testid="hist-undo" onClick={h.undo} disabled={!h.canUndo} className={BTN}
        title={h.undoLabel ? `Undo: ${h.undoLabel} (Ctrl+Z)` : "Nothing to undo (Ctrl+Z)"}
      >
        <span aria-hidden="true">↶</span> Undo
      </button>
      <button
        type="button" data-testid="hist-redo" onClick={h.redo} disabled={!h.canRedo} className={BTN}
        title={h.redoLabel ? `Redo: ${h.redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo (Ctrl+Shift+Z)"}
      >
        <span aria-hidden="true">↷</span> Redo
      </button>
      <span className="text-xs text-slate-400" data-testid="hist-label">
        {h.undoLabel ? `Undo: ${h.undoLabel}` : "Nothing to undo"}
      </span>
      <HistoryList />
      {h.error && (
        <span role="alert" data-testid="hist-error" className="text-xs text-amber-300">
          {h.error}
        </span>
      )}
    </div>
  );
}

function HistoryList() {
  const h = useHistory();
  return (
    <details className="relative" data-testid="hist-list">
      <summary data-testid="hist-list-toggle" className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
        {h.entries.length} {h.entries.length === 1 ? "action" : "actions"}
      </summary>
      <ul
        data-testid="hist-items"
        className="absolute right-0 z-20 mt-1 max-h-64 w-72 overflow-auto rounded-lg border border-white/10 bg-slate-900 p-1 text-xs shadow-xl"
      >
        {h.entries.length === 0 && <li className="p-2 text-slate-500">No actions yet</li>}
        {[...h.entries].reverse().map((e) => (
          <li
            key={e.id} data-testid={`hist-item-${e.id}`} data-current={h.entries[h.index]?.id === e.id || undefined}
            className="flex gap-2 rounded px-2 py-1 data-[current]:bg-indigo-500/20"
          >
            <span className="text-slate-500">{fmtTime(Date.parse(e.at))}</span>
            <span className="flex-1 truncate text-slate-200">{e.label}</span>
            <span className="text-slate-500">{e.origin}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

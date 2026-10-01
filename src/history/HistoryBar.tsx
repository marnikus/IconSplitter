// HistoryBar.tsx — the app-level Undo/Redo controls (request §6). Consistent
// location for every tab: the timeline is global, so the controls live in the
// app chrome, not inside a panel. Disabled states, the next-action label and
// the last outcome are all derived from the one timeline.

import { canRedo, canUndo, redoLabel, undoLabel, type HistoryDoc } from "../lib/history";
import { useHistory } from "./useHistory";

export default function HistoryBar() {
  const h = useHistory();
  const next = undoLabel(h.doc);
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="history-bar" role="group" aria-label="Undo and redo">
      <Btn testid="undo" glyph="↶" label="Undo" title={next ?? "Nothing to undo"} disabled={!canUndo(h.doc)} onClick={h.undo} />
      <Btn testid="redo" glyph="↷" label="Redo" title={redoLabel(h.doc) ?? "Nothing to redo"} disabled={!canRedo(h.doc)} onClick={h.redo} />
      <NextText doc={h.doc} />
      {h.last && (
        <span data-testid="history-status" role="status" aria-live="polite"
          className={`v2-scope-copy${h.last.err ? " warn" : ""}`}>{h.last.text}</span>
      )}
      <HistoryList />
    </div>
  );
}

function Btn({ testid, glyph, label, title, disabled, onClick }: {
  testid: string; glyph: string; label: string; title: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" data-testid={testid} title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className="rounded-lg px-2 py-1 text-sm text-slate-300 transition hover:bg-white/10 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
      <span aria-hidden="true">{glyph}</span> {label}
    </button>
  );
}

/** The concise "what would Undo do" text, also used as the button tooltip. */
function NextText({ doc }: { doc: HistoryDoc }) {
  const text = undoLabel(doc) ?? redoLabel(doc);
  return (
    <span data-testid="history-next" className="hidden max-w-[22rem] truncate text-xs text-slate-400 sm:inline">
      {text ?? "No reversible actions yet"}
    </span>
  );
}

/** Optional compact history list (request §6), newest first. */
function HistoryList() {
  const { doc } = useHistory();
  if (doc.entries.length === 0) return null;
  const recent = doc.entries.slice(-8).reverse();
  return (
    <details className="relative">
      <summary data-testid="history-list" className="cursor-pointer text-xs text-slate-400">History ({doc.entries.length})</summary>
      <ol data-testid="history-entries" className="absolute right-0 z-40 mt-1 w-72 space-y-1 rounded-xl border border-white/10 bg-slate-900 p-2 text-xs shadow-xl">
        {recent.map((e, i) => (
          <li key={e.id} className={`truncate ${i === doc.entries.length - 1 - doc.cursor ? "text-slate-100" : "text-slate-400"}`}>
            {e.label}
          </li>
        ))}
      </ol>
    </details>
  );
}

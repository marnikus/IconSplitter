// StockRejectedUploadsDialog.tsx — "Remove unsuccessful uploads": paste the
// stock site's failed-files table (HTML) or a comma-separated list of names,
// pick the stock, and Process drops that stock's badge and history records.

import { useMemo, useState, useSyncExternalStore } from "react";
import { matchRejectedItems, parseRejectedFileNames } from "../lib/stockupload/rejectedfiles";
import { getStockUploadBatches, subscribeStockUploadBatches } from "./batchhistorystore";
import { stockOptionsOf, type StockOption } from "./stockoptions";
import type { StockUploadApi } from "./useStockUpload";

type Match = ReturnType<typeof matchRejectedItems>;

/** Stock pick + pasted text, and the live preview of what Process would touch. */
function useRejectedForm(g: StockUploadApi) {
  const batches = useSyncExternalStore(subscribeStockUploadBatches, getStockUploadBatches);
  const options = useMemo(() => stockOptionsOf(g.presetState.presets, batches), [g.presetState.presets, batches]);
  const [stockId, setStockId] = useState(g.presetState.activePresetId);
  const [text, setText] = useState("");
  const stock = options.find((o) => o.id === stockId) ?? options[0] ?? null;
  const names = useMemo(() => parseRejectedFileNames(text), [text]);
  const match = useMemo(
    () => (stock === null ? null : matchRejectedItems(names, { stockId: stock.id, batches, items: g.items })),
    [stock, names, batches, g.items],
  );
  const process = stock === null || !match || match.itemIds.length === 0 ? null : () => {
    g.removeRejectedUploads({ stock, names, items: g.items });
    g.closeDialog();
  };
  return { options, stock, setStockId, text, setText, names, match, process };
}

export default function StockRejectedUploadsDialog({ g }: { g: StockUploadApi }) {
  const { options, stock, setStockId, text, setText, names, match, process } = useRejectedForm(g);
  return (
    <div className="svg-backdrop" data-testid="stock-rejected-backdrop" onClick={g.closeDialog}>
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="stock-rejected-title"
        data-testid="stock-rejected-dialog" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") g.closeDialog(); }}>
        <header className="svg-modal-head">
          <h2 id="stock-rejected-title">Remove unsuccessful uploads</h2>
          <button type="button" className="svg-btn tiny" onClick={g.closeDialog}>Close</button>
        </header>
        <RejectedInput options={options} stockId={stock?.id ?? ""} onStock={setStockId} text={text} onText={setText} />
        <RejectedPreview names={names.length} match={match} />
        <RejectedActions onCancel={g.closeDialog} onProcess={process} />
      </section>
    </div>
  );
}

function RejectedActions({ onCancel, onProcess }: { onCancel: () => void; onProcess: (() => void) | null }) {
  return (
    <footer className="svg-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button type="button" className="svg-btn" data-testid="stock-rejected-cancel" onClick={onCancel}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="stock-rejected-process"
        disabled={onProcess === null} onClick={onProcess ?? undefined}>Process</button>
    </footer>
  );
}

function RejectedInput({ options, stockId, onStock, text, onText }: {
  options: StockOption[]; stockId: string; onStock: (id: string) => void; text: string; onText: (t: string) => void;
}) {
  return (
    <div className="svg-modal-body">
      <div className="stock-history-picker">
        <label htmlFor="stock-rejected-stock">Stock</label>
        <select id="stock-rejected-stock" className="svg-input" data-testid="stock-rejected-stock"
          value={stockId} onChange={(e) => onStock(e.target.value)}>
          {options.length === 0 && <option value="">No stocks configured</option>}
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <label htmlFor="stock-rejected-text" className="svg-note">
        Paste the stock site's failed-files table (copied HTML) or file names separated by commas or lines.
      </label>
      <textarea id="stock-rejected-text" className="svg-input" data-testid="stock-rejected-text" rows={8}
        placeholder="0569-download-icon-28_01_v3.eps, icon-snowflake_2_01.eps" value={text}
        onChange={(e) => onText(e.target.value)} />
    </div>
  );
}

function RejectedPreview({ names, match }: { names: number; match: Match | null }) {
  if (names === 0 || match === null) return <p className="svg-note" data-testid="stock-rejected-summary">No file names found yet.</p>;
  return (
    <div className="svg-modal-body">
      <p className="svg-note" data-testid="stock-rejected-summary">
        {names} file name(s) · <strong>{match.itemIds.length}</strong> matching item(s) will lose this stock's badge
        and leave its upload history. Items sharing a file name are all included.
      </p>
      {match.unmatchedNames.length > 0 && (
        <details data-testid="stock-rejected-unmatched">
          <summary>{match.unmatchedNames.length} name(s) not found in this stock's history or the list</summary>
          <p className="svg-note">{match.unmatchedNames.join(", ")}</p>
        </details>
      )}
    </div>
  );
}

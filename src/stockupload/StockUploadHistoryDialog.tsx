// StockUploadHistoryDialog.tsx — per-stock runs and their file details.

import { useMemo, useState, useSyncExternalStore } from "react";
import type { StockUploadBatch } from "../lib/stockupload/batchhistory";
import { getStockUploadBatches, subscribeStockUploadBatches } from "./batchhistorystore";
import StockUploadHistoryFiles from "./StockUploadHistoryFiles";
import type { StockUploadApi } from "./useStockUpload";

interface StockOption { id: string; name: string }

function optionsOf(presets: StockUploadApi["presetState"]["presets"], batches: readonly StockUploadBatch[]): StockOption[] {
  const options = new Map(presets.map((preset) => [preset.id, { id: preset.id, name: preset.name }]));
  for (const batch of batches) if (!options.has(batch.stockId)) options.set(batch.stockId, { id: batch.stockId, name: batch.stockName });
  return [...options.values()];
}

function uploadDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function fileCount(batch: StockUploadBatch): string {
  return `${batch.uploadedCount} file${batch.uploadedCount === 1 ? "" : "s"} uploaded`;
}

export default function StockUploadHistoryDialog({ g }: { g: StockUploadApi }) {
  const batches = useSyncExternalStore(subscribeStockUploadBatches, getStockUploadBatches);
  const options = useMemo(() => optionsOf(g.presetState.presets, batches), [g.presetState.presets, batches]);
  const [stockId, setStockId] = useState(g.presetState.activePresetId);
  const [batchId, setBatchId] = useState<string | null>(null);
  const selected = batches.filter((batch) => batch.stockId === stockId).slice().reverse();
  const opened = selected.find((batch) => batch.id === batchId) ?? null;
  return (
    <div className="svg-backdrop" data-testid="stock-upload-history-backdrop" onClick={g.closeDialog}>
      <section className="svg-modal wide stock-history-modal" role="dialog" aria-modal="true"
        aria-labelledby="stock-upload-history-title" data-testid="stock-upload-history-dialog"
        onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") g.closeDialog(); }}>
        <header className="svg-modal-head">
          <h2 id="stock-upload-history-title">Upload history</h2>
          <button type="button" className="svg-btn tiny" onClick={g.closeDialog}>Close</button>
        </header>
        <HistoryStockPicker options={options} value={stockId} onChange={(id) => { setStockId(id); setBatchId(null); }} />
        <HistoryBatchList batches={selected} openedId={batchId} onOpen={setBatchId} />
        {opened && <BatchDetail g={g} batch={opened} />}
      </section>
    </div>
  );
}

function HistoryStockPicker({ options, value, onChange }: {
  options: StockOption[]; value: string; onChange: (id: string) => void;
}) {
  return (
    <div className="stock-history-picker">
      <label htmlFor="stock-history-stock-select">Stock</label>
      <select id="stock-history-stock-select" className="svg-input" data-testid="stock-history-stock-select"
        value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 && <option value="">No stocks configured</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </div>
  );
}

function HistoryBatchList({ batches, openedId, onOpen }: {
  batches: StockUploadBatch[]; openedId: string | null; onOpen: (id: string | null) => void;
}) {
  if (batches.length === 0) return <p className="svg-empty stock-history-empty">No upload batches for this stock yet.</p>;
  return (
    <div className="stock-history-batches" role="list" aria-label="Uploaded batches">
      {batches.map((batch) => (
        <button key={batch.id} type="button" className={`stock-history-batch${openedId === batch.id ? " active" : ""}`}
          data-testid={`stock-upload-history-batch-${batch.id}`}
          aria-expanded={openedId === batch.id} onClick={() => onOpen(openedId === batch.id ? null : batch.id)}>
          <span><strong>{uploadDate(batch.uploadedAt)}</strong><small>{fileCount(batch)}</small></span>
          <span className="stock-history-note" data-testid={`stock-upload-history-note-${batch.id}`} title={batch.note ?? "No note"}>
            {batch.note?.trim() || "—"}
          </span>
          <span className="stock-history-outcome">{batch.failedCount > 0 ? `${batch.failedCount} failed` : batch.cancelled ? "Cancelled" : "Complete"}</span>
        </button>
      ))}
    </div>
  );
}

function BatchDetail({ g, batch }: { g: StockUploadApi; batch: StockUploadBatch }) {
  const visible = new Set(g.visible.map((item) => item.id));
  const available = [...new Set(batch.files.map((file) => file.itemId))].filter((id) => visible.has(id));
  const [copied, setCopied] = useState("");
  return (
    <section className="stock-history-detail" aria-label="Uploaded files in batch">
      <header>
        <strong>{fileCount(batch)}</strong>
        <span>{batch.failedCount} failed{batch.cancelled ? " · cancelled" : ""}</span>
        <button type="button" className="svg-btn tiny" data-testid="stock-history-select-files"
          disabled={available.length === 0} onClick={() => g.selectIds(available)}>
          Select all files{available.length > 0 ? ` (${available.length} matching items)` : ""}
        </button>
      </header>
      {copied && <span role="status" className="stock-history-copy-status">{copied}</span>}
      <StockUploadHistoryFiles batch={batch} rootRef={g.rootRef} rootToken={g.model.rootToken}
        onCopy={async (path) => {
          try { await navigator.clipboard.writeText(path); setCopied("File path copied"); }
          catch { setCopied("Clipboard unavailable — select and copy the path manually"); }
        }} />
    </section>
  );
}

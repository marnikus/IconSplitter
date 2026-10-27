import { useState } from "react";
import type { StockPackage } from "../lib/stockupload/types";
import { refreshStockMetadata } from "../lib/stockupload/metadata";
import { patchStock, stockState } from "./state";
import { rescanStock } from "./actions";
export default function StockMetadata({ row, disabled }: { row: StockPackage; disabled: boolean }) {
  const [metadata, setMetadata] = useState(row.metadata), [saving, setSaving] = useState(false);
  const edited = JSON.stringify(metadata) !== JSON.stringify(row.metadata);
  async function save(): Promise<void> {
    const root = stockState().root; if (!root || saving || !window.confirm("Refresh metadata in these exported files and their export.json? No source artwork or renders will change.")) return;
    setSaving(true); patchStock({ busy: true });
    try { await refreshStockMetadata(root, row, metadata); patchStock({ message: "Metadata accepted and embedded; this is not stock ingestion acceptance" }); }
    catch (error) { patchStock({ message: error instanceof Error ? error.message : "Metadata refresh failed; rescan required" }); }
    finally { setSaving(false); patchStock({ busy: false }); await rescanStock(); }
  }
  return <fieldset className="stock-meta" disabled={disabled || saving}><legend>Exported metadata</legend>
    {(["title", "description", "creator", "copyright"] as const).map(key => <label key={key}>{key}<input value={metadata[key] || ""} onChange={e => setMetadata({ ...metadata, [key]: e.target.value })} /></label>)}
    <label>Keywords <textarea value={metadata.tags.join(", ")} onChange={e => setMetadata({ ...metadata, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></label>
    <button disabled={!edited} onClick={() => void save()}>Accept & embed metadata</button><small>Automatic validation. JPEG/EPS: XMP + IPTC-IIM; SVG: embedded metadata. No rerender.</small>
  </fieldset>;
}

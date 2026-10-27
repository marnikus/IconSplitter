import { useState } from "react";
import type { StockPackage } from "../lib/stockupload/types";
import { cleanMetadata, validateMetadata } from "../lib/upload/meta";
import { refreshStockMetadata } from "../lib/stockupload/metadata";
import { MetaFieldsGrid, ValidationLine } from "../upload/UploadMetaFields";
import UploadMetaRights from "../upload/UploadMetaRights";
import { patchStock, stockState } from "./state";
import { rescanStock } from "./actions";
import { confirmStockAction } from "./confirmation";
export default function StockMetadata({ row, disabled }: { row: StockPackage; disabled: boolean }) {
  const [metadata, setMetadata] = useState(row.metadata), [saving, setSaving] = useState(false);
  const edited = JSON.stringify(metadata) !== JSON.stringify(row.metadata), validation = validateMetadata(cleanMetadata(metadata));
  async function save(): Promise<void> {
    const root = stockState().root; if (!root || saving || !await confirmStockAction("Refresh exported metadata", "Refresh metadata in these exported files and their export.json? No source artwork or renders will change.")) return;
    setSaving(true); patchStock({ busy: true });
    try { await refreshStockMetadata(root, row, metadata); patchStock({ message: "Metadata accepted and embedded; this is not stock ingestion acceptance" }); }
    catch (error) { patchStock({ message: error instanceof Error ? error.message : "Metadata refresh failed; rescan required" }); }
    finally { setSaving(false); patchStock({ busy: false }); await rescanStock(); }
  }
  const onEdit = (patch: Partial<typeof metadata>) => setMetadata(m => ({ ...m, ...patch }));
  const onCopy = (field: "title" | "description" | "tags") => { void copyMetadata(field === "tags" ? metadata.tags.join(", ") : metadata[field]); };
  return <fieldset className="up-shadow-fields up-meta" disabled={disabled || saving}><legend className="svg-label">Exported metadata</legend>
    <MetaFieldsGrid id={`stock-${row.id}`} m={metadata} onEdit={onEdit} onCopy={onCopy} />
    <UploadMetaRights id={`stock-${row.id}`} metadata={metadata} onEdit={onEdit} />
    <ValidationLine id={`stock-${row.id}`} validation={edited ? validation : null} />
    <div className="up-meta-actions"><button type="button" className="svg-btn tiny success" disabled={!edited || !validation.ok} onClick={() => void save()}>✓ Accept & embed metadata</button>
      <small className="up-hint">Automatic validation. JPEG/EPS: XMP + IPTC-IIM; SVG: embedded metadata. No rerender.</small></div>
  </fieldset>;
}

async function copyMetadata(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); patchStock({ message: "Metadata copied" }); }
  catch { patchStock({ message: "Clipboard permission denied — select the text and copy it by hand" }); }
}

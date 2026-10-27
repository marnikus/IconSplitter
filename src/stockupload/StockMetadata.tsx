import { copyMetadataField } from "../upload/metacopy";
import { useState } from "react";
import type { StockPackage } from "../lib/stockupload/types";
import { cleanMetadata, validateMetadata } from "../lib/upload/meta";
import { refreshStockMetadata } from "../lib/stockupload/metadata";
import { MetadataEditor } from "../upload/UploadMetaFields";
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
  const onCopy = (field: "title" | "description" | "tags") => { void copyMetadataField(metadata, field, message => patchStock({ message })); };
  return <fieldset className="up-shadow-fields" disabled={disabled || saving}><legend className="svg-label">Exported metadata</legend>
    <MetadataEditor id={`stock-${row.id}`} metadata={metadata} validation={edited ? validation : null} onEdit={onEdit} onCopy={onCopy}
      actions={<div className="up-meta-actions"><button type="button" className="svg-btn tiny success" disabled={!edited || !validation.ok} onClick={() => void save()}>✓ Accept & embed metadata</button>
      <small className="up-hint">Automatic validation. JPEG/EPS: XMP + IPTC-IIM; SVG: embedded metadata. No rerender.</small></div>} />
  </fieldset>;
}

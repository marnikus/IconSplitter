// StockUploadRow.tsx — one exported item row: preview, stem + export/ path +
// general row badges, formats, metadata summary, and actions.

import { memo } from "react";
import type { DirHandleLike } from "../lib/fs";
import { selectIntent, type SelectIntent } from "../lib/reviewselect";
import type { ExportedItem } from "../lib/stockupload/types";
import type { PreviewBackground } from "../lib/svgbackground";
import type { IconMetadata } from "../lib/upload/meta";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import { useRowBinding, type RegisterCheckedRow } from "../ui/checkedrows";
import { isRowGestureClick } from "../ui/rowgesture";
import UploadRowBadges from "../upload/UploadRowBadges";
import StockUploadMetaFields from "./StockUploadMetaFields";
import StockUploadPreview from "./StockUploadPreview";
import type { StockMetaDraft } from "./rowlist";

export interface StockRowPresentation {
  thumb: number;
  bg: PreviewBackground;
  rootToken: number;
  rootRef: { current: DirHandleLike | null };
  rowBadges: RowBadgeState;
  toggleCheck: (id: string) => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  openLocation: (id: string) => void;
  toggleRowBadge: (pairId: string, badgeId: string) => void;
  metaDraftOf: (item: ExportedItem) => StockMetaDraft;
  editMeta: (item: ExportedItem, patch: Partial<IconMetadata>) => void;
  acceptMeta: (item: ExportedItem) => void;
  copyMeta: (item: ExportedItem, field: "title" | "description" | "tags") => void;
}

function handleRowKey(e: React.KeyboardEvent, itemId: string, a: StockRowPresentation): void {
  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    a.selectRow(itemId, "replace");
  }
}

function StockUploadRowView({ item, a, active = false, register }: {
  item: ExportedItem; a: StockRowPresentation; active?: boolean; register: RegisterCheckedRow;
}) {
  const ref = useRowBinding(item.id, register);
  return (
    <div ref={ref} role="listitem" data-testid={`stock-row-${item.id}`} tabIndex={-1}
      className="up-row stock-up-row processed"
      onClick={(e) => { if (isRowGestureClick(e)) a.selectRow(item.id, selectIntent(e)); }}
      onKeyDown={(e) => handleRowKey(e, item.id, a)}>
      <input type="checkbox" className="up-check" data-testid={`stock-check-${item.id}`}
        aria-label={`Select ${item.stem}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(item.id)} />
      <StockUploadPreview rootRef={a.rootRef} rootToken={a.rootToken} item={item} thumb={a.thumb} bg={a.bg} />
      <FileIdentityCell item={item} a={a} />
      <FormatsCell item={item} />
      <MetadataSummaryCell item={item} draft={a.metaDraftOf(item)} />
      <RowActionsCell item={item} a={a} />
      {active && <ExpandedRowMeta item={item} a={a} />}
    </div>
  );
}

function ExpandedRowMeta({ item, a }: { item: ExportedItem; a: StockRowPresentation }) {
  return (
    <div className="up-detail" data-testid={`stock-detail-${item.id}`}>
      <StockUploadMetaFields
        id={item.id}
        draft={a.metaDraftOf(item)}
        onEdit={(patch) => a.editMeta(item, patch)}
        onAccept={() => a.acceptMeta(item)}
        onCopy={(f) => a.copyMeta(item, f)}
      />
    </div>
  );
}

export default memo(StockUploadRowView);

function primaryPathOf(item: ExportedItem): string {
  return item.files.raster?.relPath ?? item.files.svg?.relPath ?? item.files.eps?.relPath ?? item.recordPath;
}

function FileIdentityCell({ item, a }: { item: ExportedItem; a: StockRowPresentation }) {
  const primary = primaryPathOf(item);
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" data-testid={`stock-name-${item.id}`} title={item.stem}>{item.stem}</div>
      <div className="svg-file-sub" data-testid={`stock-path-${item.id}`} title={primary}>{primary}</div>
      <div className="svg-persist" title={item.recordPath}>export folder → {item.exportDir || "export"}</div>
      <UploadRowBadges pairId={item.id} state={a.rowBadges} onToggle={a.toggleRowBadge} />
    </div>
  );
}

function FormatsCell({ item }: { item: ExportedItem }) {
  const list: string[] = [];
  if (item.files.raster) list.push(item.files.raster.ext.toUpperCase());
  if (item.files.svg) list.push("SVG");
  if (item.files.eps) list.push("EPS");
  list.push("ZIP");
  return (
    <div className="svg-cell" data-testid={`stock-formats-${item.id}`}>
      <small>{list.join(" · ")}</small>
      {item.missingRecorded.length > 0 && (
        <small className="svg-error">{item.missingRecorded.length} recorded file(s) missing</small>
      )}
    </div>
  );
}

function MetadataSummaryCell({ item, draft }: { item: ExportedItem; draft: StockMetaDraft }) {
  return (
    <div className="svg-cell" data-testid={`stock-meta-cell-${item.id}`}>
      <span className={`svg-badge ${draft.state}`}>{draft.state}</span>
      {draft.metadata.tags.length > 0 && <small>{draft.metadata.tags.length} tags</small>}
    </div>
  );
}

function RowActionsCell({ item, a }: { item: ExportedItem; a: StockRowPresentation }) {
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`stock-meta-btn-${item.id}`}
        onClick={(e) => { e.stopPropagation(); a.selectRow(item.id, "replace"); }}>
        Metadata
      </button>
      <button type="button" className="svg-btn tiny" data-testid={`stock-location-${item.id}`}
        title="Copy export folder path"
        onClick={(e) => { e.stopPropagation(); a.openLocation(item.id); }}>
        Location
      </button>
    </div>
  );
}

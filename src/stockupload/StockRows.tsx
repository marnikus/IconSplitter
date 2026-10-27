import type { MouseEvent } from "react";
import type { StockPackage } from "../lib/stockupload/types";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import { selectIntent, toggleChecked } from "../lib/reviewselect";
import { useHistoryActions } from "../state/HistoryProvider";
import { copyFolderText } from "../lib/copypath";
import { isRowGestureClick } from "../ui/rowgesture";
import UploadRowBadges from "../upload/UploadRowBadges";
import { stockRowGesture, commitStockSelection } from "./selection";
import { patchStock, stockState } from "./state";
import StockThumbnail from "./StockThumbnail";
import StockMetadata from "./StockMetadata";
export interface StockRowsProps { rows: StockPackage[]; badges: RowBadgeState; zoom: number; busy: boolean; onToggle: (id: string, badge: string) => void }
export default function StockRows(p: StockRowsProps) {
  return <div className="svg-panel" data-testid="stock-list">
    <header className="svg-head"><div className="svg-title"><h1>EXPORTED PACKAGES / UPLOAD</h1><span>{p.rows.length}</span><span>one package per export folder</span></div></header>
    <div className="pair-table">
      <div className="up-columns" aria-hidden="true"><span /><span>Exported preview</span><span>File / export folder</span><span>Package</span><span>Metadata</span><span>Settings</span><span>Actions</span></div>
      <div className="svg-rows" role="listbox" aria-label="Exported packages to upload">
        {p.rows.map(row => <StockRow key={row.id} row={row} context={p} />)}
        {p.rows.length === 0 && <p className="svg-empty">No committed export package matches these filters.</p>}
      </div>
    </div>
    <footer className="svg-list-footer"><span>{p.rows.length} shown · verified exported files only</span><span>Click to review metadata · Q/E to check/uncheck · Shift/Ctrl for ranges/toggles</span></footer>
  </div>;
}
function StockRow({ row, context: p }: { row: StockPackage; context: StockRowsProps }) {
  const history = useHistoryActions(), state = stockState(), selected = state.selection.checked.includes(row.id), active = state.selection.active === row.id;
  const activate = (e: MouseEvent) => {
    if (!isRowGestureClick(e) || p.busy) return;
    stockRowGesture({ id: row.id, intent: selectIntent(e), visibleIds: p.rows.map(r => r.id) }, history);
  };
  return <div data-testid="stock-row" role="listitem" tabIndex={-1} aria-current={active ? "true" : undefined}
    className={`up-row${active ? " active" : ""}${selected ? " selected" : ""}`} onClick={activate}>
    <input type="checkbox" className="up-check" aria-label={`Select ${row.name}`} checked={selected} disabled={p.busy}
      onChange={() => commitStockSelection({ ...state.selection, checked: toggleChecked(state.selection.checked, row.id) }, history)} />
    <StockThumbnail row={row} zoom={p.zoom} />
    <FileCell row={row} p={p} />
    <div className="svg-cell"><span className="svg-badge approved">Exported</span>{row.warning && <small className="up-hint">{row.warning}</small>}</div>
    <div className="svg-cell"><span className="svg-badge">Exported metadata</span></div>
    <div className="svg-cell"><span className="up-hint">Destination presets in toolbar</span></div>
    <div className="svg-cell"><button type="button" className="svg-btn tiny" onClick={() => void copyFolderText(state.root, row.artifacts[0].path, message => patchStock({ message }))}>Location · copy folder</button></div>
    {active && <div className="up-detail"><StockMetadata key={row.recordText} row={row} disabled={p.busy} /></div>}
  </div>;
}
function FileCell({ row, p }: { row: StockPackage; p: StockRowsProps }) {
  return <div className="svg-file-main">
    <strong className="svg-file-name">{row.name}</strong>
    <div className="svg-file-sub"><code>{row.artifacts[0].path}</code></div>
    <div className="svg-persist">{row.artifacts.map(a => a.kind.toUpperCase()).join(" · ")}</div>
    <UploadRowBadges pairId={row.pairId} state={p.badges} onToggle={p.onToggle} />
  </div>;
}

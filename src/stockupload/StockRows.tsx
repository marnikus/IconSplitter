import PackageList, { PackageListHead, PackageListFooter } from "../ui/PackageList";
import PackageRow, { PackageFileCell } from "../ui/PackageRow";
import type { StockPackage } from "../lib/stockupload/types";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import { toggleChecked } from "../lib/reviewselect";
import { useHistoryActions } from "../state/HistoryProvider";
import { copyFolderText } from "../lib/copypath";
import UploadRowBadges from "../upload/UploadRowBadges";
import { stockRowGesture, commitStockSelection } from "./selection";
import { patchStock, stockState } from "./state";
import StockThumbnail from "./StockThumbnail";
import StockMetadata from "./StockMetadata";
export interface StockRowsProps { rows: StockPackage[]; badges: RowBadgeState; zoom: number; busy: boolean; onToggle: (id: string, badge: string) => void }
export default function StockRows(p: StockRowsProps) {
  return <PackageList testid="stock-list" previewLabel="Exported preview" label="Exported packages to upload"
    empty={p.rows.length === 0} emptyText="No committed export package matches these filters."
    header={<PackageListHead title="EXPORTED PACKAGES / UPLOAD" count={p.rows.length} scope="one package per export folder" />}
    footer={<PackageListFooter summary={`${p.rows.length} shown · verified exported files only`} hint="Click to review metadata · Q/E to check/uncheck · Shift/Ctrl for ranges/toggles" />}>
    {p.rows.map(row => <StockRow key={row.id} row={row} context={p} />)}
  </PackageList>;
}
function StockRow({ row, context: p }: { row: StockPackage; context: StockRowsProps }) {
  const history = useHistoryActions(), state = stockState(), selected = state.selection.checked.includes(row.id), active = state.selection.active === row.id;
  return <PackageRow testid="stock-row" name={row.name} active={active} checked={selected} disabled={p.busy}
    className={`${active ? "active " : ""}${selected ? "selected" : ""}`}
    onSelect={intent => stockRowGesture({ id: row.id, intent, visibleIds: p.rows.map(r => r.id) }, history)}
    onToggle={() => commitStockSelection({ ...state.selection, checked: toggleChecked(state.selection.checked, row.id) }, history)}
    detail={active ? <StockMetadata key={row.recordText} row={row} disabled={p.busy} /> : null}>
    <StockThumbnail row={row} zoom={p.zoom} />
    <FileCell row={row} p={p} />
    <div className="svg-cell"><span className="svg-badge approved">Exported</span>{row.warning && <small className="up-hint">{row.warning}</small>}</div>
    <div className="svg-cell"><span className="svg-badge">Exported metadata</span></div>
    <div className="svg-cell"><span className="up-hint">Destination presets in toolbar</span></div>
    <div className="svg-cell"><button type="button" className="svg-btn tiny" onClick={() => void copyFolderText(state.root, row.artifacts[0].path, message => patchStock({ message }))}>Location · copy folder</button></div>
  </PackageRow>;
}
function FileCell({ row, p }: { row: StockPackage; p: StockRowsProps }) {
  return <PackageFileCell name={row.name} path={row.artifacts[0].path} info={row.artifacts.map(a => a.kind.toUpperCase()).join(" · ")}>
    <UploadRowBadges pairId={row.pairId} state={p.badges} onToggle={p.onToggle} />
  </PackageFileCell>;
}

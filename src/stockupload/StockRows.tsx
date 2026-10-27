import type { MouseEvent } from "react";
import type { StockPackage } from "../lib/stockupload/types";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import { selectIntent } from "../lib/reviewselect";
import { useHistoryActions } from "../state/HistoryProvider";
import { copyFolderText } from "../lib/copypath";
import { isRowGestureClick } from "../ui/rowgesture";
import UploadRowBadges from "../upload/UploadRowBadges";
import { stockRowGesture, commitStockSelection } from "./selection";
import { patchStock, stockState } from "./state";
import StockThumbnail from "./StockThumbnail";
import StockMetadata from "./StockMetadata";
import { toggleChecked } from "../lib/reviewselect";
export interface StockRowsProps { rows: StockPackage[]; badges: RowBadgeState; zoom: number; busy: boolean; onToggle: (id: string, badge: string) => void }
export default function StockRows(p: StockRowsProps) {
  return <div className="stock-list" data-testid="stock-list">{p.rows.map(row => <StockRow key={row.id} row={row} context={p} />)}</div>;
}
function StockRow({ row, context: p }: { row: StockPackage; context: StockRowsProps }) {
  const history = useHistoryActions(), state = stockState(), selected = state.selection.checked.includes(row.id);
  const activate = (e: MouseEvent) => {
    if (!isRowGestureClick(e) || p.busy) return;
    stockRowGesture({ id: row.id, intent: selectIntent(e), visibleIds: p.rows.map(r => r.id) }, history);
  };
  return <article data-testid="stock-row" className={`stock-row ${state.selection.active === row.id ? "active" : ""}`} onClick={activate}>
    <div className="stock-row-heading"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected} disabled={p.busy}
      onChange={() => commitStockSelection({ ...state.selection, checked: toggleChecked(state.selection.checked, row.id) }, history)} />
      <StockThumbnail row={row} zoom={p.zoom} /><div><strong>{row.name}</strong><code>{row.artifacts[0].path}</code>
        <p>{row.artifacts.map(a => a.kind.toUpperCase()).join(" · ")}{row.warning && ` · ${row.warning}`}</p>
        <UploadRowBadges pairId={row.pairId} state={p.badges} onToggle={p.onToggle} />
      </div><button onClick={() => void copyFolderText(state.root, row.artifacts[0].path, message => patchStock({ message }))}>Location · copy folder</button>
    </div>{state.selection.active === row.id && <StockMetadata key={row.recordText} row={row} disabled={p.busy} />}
  </article>;
}

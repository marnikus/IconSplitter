import type { RowBadge } from "../lib/upload/rowbadge";
import { ALL_UPLOAD_FILTER } from "../upload/types";
import UploadRowBadgeFilter from "../upload/UploadRowBadgeFilter";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import { chooseStockRoot, rescanStock } from "./actions";
import type { StockState } from "./state";
import StockAccount from "./StockAccount";
export interface StockControlsProps {
  state: StockState; catalog: readonly RowBadge[]; query: string; filter: string; sort: string;
  onQuery: (value: string) => void; onFilter: (value: string) => void; onSort: (value: string) => void; onBadges: () => void;
}
export default function StockControls(p: StockControlsProps) {
  return <section className="svg-controls" aria-label="Upload controls">
    <div className="svg-toolbar"><div className="svg-source">
      <OpenFolderButton testid="stock-open-folder" onClick={() => void chooseStockRoot()} />
      <button type="button" className="svg-btn" disabled={!p.state.root || p.state.busy || p.state.scanning} onClick={() => void rescanStock()}>↻ Rescan</button>
      <span className="svg-recursive">Committed exports only · transfer is not submission or stock approval</span>
    </div></div>
    <FolderPathRow root={p.state.root} testid="stock-full-path" />
    <div className="svg-toolbar panels"><StockAccount disabled={p.state.busy} /></div>
    <div className="svg-conn-row">
      <label className="svg-field grow"><span className="svg-label">Search</span><input className="svg-input" placeholder="Filter name or path" aria-label="Filter exports" value={p.query} onChange={e => p.onQuery(e.target.value)} /></label>
      <UploadRowBadgeFilter filter={{ ...ALL_UPLOAD_FILTER, badge: p.filter }} catalog={p.catalog} onFilter={patch => p.onFilter(patch.badge ?? "all")} onOpen={p.onBadges} />
      <label className="svg-field"><span className="svg-label">Sort</span><select className="svg-input" aria-label="Sort exports" value={p.sort} onChange={e => p.onSort(e.target.value)}><option value="name">Name</option><option value="path">Path</option></select></label>
    </div>
  </section>;
}

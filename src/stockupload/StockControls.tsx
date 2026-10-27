import type { RowBadge } from "../lib/upload/rowbadge";
import { ALL_UPLOAD_FILTER } from "../upload/types";
import UploadRowBadgeFilter from "../upload/UploadRowBadgeFilter";
import FolderSource from "../ui/FolderSource";
import { Select, TextField } from "../ui/fields";
import { chooseStockRoot, rescanStock } from "./actions";
import type { StockState } from "./state";
import StockAccount from "./StockAccount";
export interface StockControlsProps {
  state: StockState; catalog: readonly RowBadge[]; query: string; filter: string; sort: string;
  onQuery: (value: string) => void; onFilter: (value: string) => void; onSort: (value: string) => void; onBadges: () => void;
}
export default function StockControls(p: StockControlsProps) {
  return <section className="svg-controls" aria-label="Upload controls">
    <FolderSource root={p.state.root} openTestid="stock-open-folder" pathTestid="stock-full-path"
      onOpen={() => void chooseStockRoot()} onRescan={() => void rescanStock()} rescanDisabled={!p.state.root || p.state.busy || p.state.scanning}
      scope="Committed exports only · transfer is not submission or stock approval" />
    <div className="svg-toolbar panels"><StockAccount disabled={p.state.busy} /></div>
    <div className="svg-conn-row">
      <TextField label="Search" type="search" testid="stock-search" ariaLabel="Filter exports" placeholder="Filter name or path" value={p.query} onChange={p.onQuery} />
      <UploadRowBadgeFilter filter={{ ...ALL_UPLOAD_FILTER, badge: p.filter }} catalog={p.catalog} onFilter={patch => p.onFilter(patch.badge ?? "all")} onOpen={p.onBadges} />
      <Select label="Sort exports" testid="stock-sort" value={p.sort} options={[["name", "Name"], ["path", "Path"]]} onChange={p.onSort} />
    </div>
  </section>;
}

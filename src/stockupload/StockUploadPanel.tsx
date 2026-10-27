import { useState, useSyncExternalStore } from "react";
import { useHistoryActions } from "../state/HistoryProvider";
import { badgesOf, rowMatchesBadge } from "../lib/upload/rowbadge";
import { getRowBadgeState, subscribeRowBadges } from "../upload/rowbadgestore";
import UploadRowBadgeSettings from "../upload/UploadRowBadgeSettings";
import { useSelectShortcuts } from "../lib/selectshortcuts";
import { setChecked } from "../lib/reviewselect";
import { extensionRuntime } from "../lib/stockupload/native";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import { chooseStockRoot, rescanStock } from "./actions";
import { useStockState } from "./state";
import { useStockPreferences } from "./preferences";
import { stockBadgeActions } from "./badges";
import { commitStockSelection } from "./selection";
import { safeStockPlan, epsReviewKey } from "./planning";
import StockReport from "./StockReport";
import StockRows from "./StockRows";
import StockToolbar from "./StockToolbar";
import StockAccount from "./StockAccount";
import { useStockRootRestore } from "./restore";
import { useStockNavigation } from "./navigation";
export default function StockUploadPanel({ active }: { active: boolean }) {
  useStockRootRestore(active);
  const state = useStockState(), history = useHistoryActions(), { prefs, update } = useStockPreferences();
  const badges = useSyncExternalStore(subscribeRowBadges, getRowBadgeState, getRowBadgeState), badgeActions = stockBadgeActions(history);
  const [showBadges, setShowBadges] = useState(false), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name"), [reviewed, setReviewed] = useState("");
  const visible = state.rows.filter(r => `${r.name} ${r.dir}`.toLowerCase().includes(query.toLowerCase()) && rowMatchesBadge(badgesOf(badges, r.pairId), filter))
    .sort((a, b) => (sort === "path" ? a.dir.localeCompare(b.dir) : a.name.localeCompare(b.name)));
  const ids = visible.map(r => r.id), selected = ids.filter(id => state.selection.checked.includes(id));
  const onSelect = (on: boolean) => commitStockSelection({ ...state.selection, checked: on ? setChecked(state.selection.checked, ids, true) : [] }, history);
  const shortcuts = { activeId: state.selection.active, selectActive: () => commitStockSelection({ ...state.selection, checked: setChecked(state.selection.checked, [state.selection.active!], true) }, history), deselectActive: () => commitStockSelection({ ...state.selection, checked: setChecked(state.selection.checked, [state.selection.active!], false) }, history), selectVisible: () => onSelect(true), deselectAll: () => onSelect(false) };
  useSelectShortcuts(shortcuts, active && !state.busy && !showBadges); useStockNavigation(ids, active && !state.busy && !showBadges);
  const reviewKey = epsReviewKey(visible.filter(r => selected.includes(r.id)));
  const epsReviewed = reviewKey !== "" && reviewed === reviewKey;
  const plan = safeStockPlan(visible.filter(r => selected.includes(r.id)), prefs.formats, epsReviewed);
  return <section className="stock-upload" data-testid="stock-upload-panel" hidden={!active}><header><h1>Upload</h1><p>Committed exports only · transfer is not submission or stock approval</p></header>
    {!extensionRuntime() && <p className="stock-warning">Standalone HTML keeps local review/editing. Automatic FTPS requires the optional extension edition and companion installed on your computer.</p>}
    <div className="stock-tools"><OpenFolderButton testid="stock-open-folder" onClick={() => void chooseStockRoot()} /><button disabled={!state.root || state.busy || state.scanning} onClick={() => void rescanStock()}>Rescan</button>
      <input placeholder="Filter name or path" aria-label="Filter exports" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Badge filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All badges</option><option value="none">No badges</option>{badges.catalog.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select aria-label="Sort exports" value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name</option><option value="path">Path</option></select><button onClick={() => setShowBadges(true)}>Badge settings</button></div>
    <FolderPathRow root={state.root} testid="stock-full-path" /><StockAccount disabled={state.busy} />
    <StockToolbar prefs={prefs} update={update} selected={selected} badgeIds={visible.filter(r => selected.includes(r.id)).map(r => r.pairId)} badges={badges} onApply={badgeActions.onApply} onSelect={onSelect} plan={plan} busy={state.busy} canCancel={state.canCancel} epsReviewed={epsReviewed} onReview={on => setReviewed(on ? reviewKey : "")} />
    <StockReport state={state} plan={plan} />
    <StockRows rows={visible} badges={badges} zoom={prefs.zoom} busy={state.busy} onToggle={badgeActions.onToggle} />
    {showBadges && <UploadRowBadgeSettings state={badges} {...badgeActions} onClose={() => setShowBadges(false)} />}
  </section>;
}

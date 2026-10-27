import StockConfirmationDialog, { useStockConfirmation } from "./confirmation";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { useHistoryActions } from "../state/HistoryProvider";
import { badgesOf, rowMatchesBadge } from "../lib/upload/rowbadge";
import { getRowBadgeState, subscribeRowBadges } from "../upload/rowbadgestore";
import UploadRowBadgeSettings from "../upload/UploadRowBadgeSettings";
import { useSelectShortcuts } from "../lib/selectshortcuts";
import { setChecked } from "../lib/reviewselect";
import { extensionRuntime } from "../lib/stockupload/native";
import { useStockState } from "./state";
import { useStockPreferences } from "./preferences";
import { stockBadgeActions } from "./badges";
import { commitStockSelection } from "./selection";
import { safeStockPlan, epsReviewKey } from "./planning";
import StockReport from "./StockReport";
import StockRows from "./StockRows";
import StockToolbar from "./StockToolbar";
import StockControls from "./StockControls";
import { useStockRootRestore } from "./restore";
import { useStockNavigation } from "./navigation";
export default function StockUploadPanel({ active }: { active: boolean }) {
  useStockRootRestore(active);
  const confirmation = useStockConfirmation();
  const state = useStockState(), history = useHistoryActions(), { prefs, update } = useStockPreferences();
  const badges = useSyncExternalStore(subscribeRowBadges, getRowBadgeState, getRowBadgeState), badgeActions = stockBadgeActions(history);
  const [showBadges, setShowBadges] = useState(false), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name"), [reviewed, setReviewed] = useState("");
  const visible = state.rows.filter(r => `${r.name} ${r.dir}`.toLowerCase().includes(query.toLowerCase()) && rowMatchesBadge(badgesOf(badges, r.pairId), filter))
    .sort((a, b) => (sort === "path" ? a.dir.localeCompare(b.dir) : a.name.localeCompare(b.name)));
  const ids = visible.map(r => r.id), selected = ids.filter(id => state.selection.checked.includes(id));
  const onSelect = (on: boolean) => { if (state.busy) return; commitStockSelection({ ...state.selection, checked: on ? setChecked(state.selection.checked, ids, true) : [] }, history); };
  const shortcuts = { activeId: state.selection.active, selectActive: () => commitStockSelection({ ...state.selection, checked: setChecked(state.selection.checked, [state.selection.active!], true) }, history), deselectActive: () => commitStockSelection({ ...state.selection, checked: setChecked(state.selection.checked, [state.selection.active!], false) }, history), selectVisible: () => onSelect(true), deselectAll: () => onSelect(false) };
  useSelectShortcuts(shortcuts, active && !state.busy && !showBadges && !confirmation); useStockNavigation(ids, active && !state.busy && !showBadges && !confirmation);
  const reviewKey = epsReviewKey(visible.filter(r => selected.includes(r.id)));
  const epsReviewed = reviewKey !== "" && reviewed === reviewKey;
  const plan = safeStockPlan(visible.filter(r => selected.includes(r.id)), prefs.formats, epsReviewed);
  return <section className="svg up" data-testid="stock-upload-panel" hidden={!active} style={{ "--svg-thumb": `${prefs.zoom}px` } as CSSProperties}>
    {!extensionRuntime() && <p className="svg-note warn">Standalone HTML keeps local review/editing. Automatic FTPS requires the optional extension edition and companion installed on your computer.</p>}
    <StockControls state={state} catalog={badges.catalog} query={query} filter={filter} sort={sort} onQuery={setQuery} onFilter={setFilter} onSort={setSort} onBadges={() => setShowBadges(true)} />
    <StockToolbar prefs={prefs} update={update} selected={selected} visibleCount={ids.length} hiddenCount={state.selection.checked.length - selected.length} onToggleAll={on => { if (!state.busy) commitStockSelection({ ...state.selection, checked: setChecked(state.selection.checked, ids, on) }, history); }} badgeIds={visible.filter(r => selected.includes(r.id)).map(r => r.pairId)} badges={badges} onApply={badgeActions.onApply} onSelect={onSelect} plan={plan} busy={state.busy} canCancel={state.canCancel} epsReviewed={epsReviewed} onReview={on => setReviewed(on ? reviewKey : "")} />
    <StockReport state={state} plan={plan} />
    <StockRows rows={visible} badges={badges} zoom={prefs.zoom} busy={state.busy} onToggle={badgeActions.onToggle} />
    <StockConfirmationDialog request={confirmation} active={active} />
    {showBadges && <UploadRowBadgeSettings state={badges} {...badgeActions} onClose={() => setShowBadges(false)} />}
  </section>;
}

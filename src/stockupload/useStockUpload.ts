// useStockUpload.ts — flat orchestration hook for the "Upload" (stockUpload) tab.

import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { fsSupported } from "../batch/picker";
import type { DirHandleLike } from "../lib/fs";
import { pruneRowSelection } from "../lib/reviewselect";
import type { StockDiscovery } from "../lib/stockupload/discovery";
import { ensureStockBadges } from "../lib/stockupload/stockbadges";
import type { ExportedItem, StockHistoryMap, StockPresetState } from "../lib/stockupload/types";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import { useHistoryActions } from "../state/HistoryProvider";
import { getAppState, patchStockUpload } from "../state/appstore";
import { rememberListTargets } from "../state/listtargets";
import { useAppSlice } from "../state/useAppState";
import { getRowBadgeState, setRowBadgeState, subscribeRowBadges } from "../upload/rowbadgestore";
import { useStockFtpActions, type StockFtpActions } from "./ftpactions";
import { getStockHistory, subscribeStockHistory } from "./historystore";
import { hasFtpCredentials } from "./keystore";
import {
  createStockRefs, initialStockModel, reduceStockModel,
  type StockModelAction, type StockRefs, type StockUploadModel,
} from "./model";
import { useStockPanelOps, type StockPanelOps } from "./panelops";
import { getStockPresetState, subscribeStockPresets } from "./presetstore";
import { filterAndSortItems, stockHeaderState } from "./rowlist";
import { bootStockRoot, scanStockUpload } from "./scan";
import {
  useStockRowBadgeActions, useStockSelectionActions,
  type StockBadgeApi, type StockSelectionApi,
} from "./selectionactions";

export interface StockUploadApi extends StockSelectionApi, StockBadgeApi, StockFtpActions, StockPanelOps {
  supported: boolean;
  model: StockUploadModel;
  rootRef: { current: DirHandleLike | null };
  presetState: StockPresetState;
  rowBadges: RowBadgeState;
  history: StockHistoryMap;
  items: ExportedItem[];
  visible: ExportedItem[];
  checked: string[];
  activeId: string | null;
  header: "none" | "some" | "all";
}

function applyDiscoveredItems(found: StockDiscovery, dispatch: (a: StockModelAction) => void): void {
  const knownIds = found.items.map((it) => it.id);
  rememberListTargets("stockUpload", knownIds);
  const cur = getAppState().stockUpload;
  const pruned = pruneRowSelection(
    { checked: cur.checked, active: cur.activeId, anchor: cur.anchorId },
    new Set(knownIds),
  );
  patchStockUpload({ checked: pruned.checked, activeId: pruned.active, anchorId: pruned.anchor });
  dispatch({ type: "patch", patch: { discovery: found } });
}

function syncPresetsBadges(presets: StockPresetState["presets"]): void {
  const curBadges = getRowBadgeState();
  const syncedBadges = ensureStockBadges(curBadges, presets);
  if (syncedBadges !== curBadges) setRowBadgeState(syncedBadges);
}

function useBootEffects(
  r: StockRefs,
  presets: StockPresetState["presets"],
  dispatch: (a: StockModelAction) => void,
  runScan: (audible?: boolean) => void,
): void {
  useEffect(() => {
    let alive = true;
    void bootStockRoot().then((root) => {
      if (!alive || !root) return;
      r.root.current = root;
      r.scan.scanKey.current = null;
      dispatch({ type: "patch", patch: { rootName: root.name } });
      runScan(false);
    });
    return () => { alive = false; };
  }, [r, dispatch, runScan]);

  useEffect(() => {
    syncPresetsBadges(presets);
    let alive = true;
    for (const p of presets) {
      void hasFtpCredentials(p.id).then((saved) => { if (alive) dispatch({ type: "cred", id: p.id, saved }); });
    }
    return () => { alive = false; };
  }, [presets, dispatch]);
}

function useScanTrigger(r: StockRefs, dispatch: (a: StockModelAction) => void, say: (m: string, err?: boolean) => void) {
  return useCallback((audible = false) => {
    const root = r.root.current;
    if (!root) return;
    dispatch({ type: "patch", patch: { rootToken: Date.now() } });
    void scanStockUpload(r.scan, root, {
      setRootName: (rootName) => dispatch({ type: "patch", patch: { rootName } }),
      setDiscovery: (found) => applyDiscoveredItems(found, dispatch),
      setBusy: (busy) => dispatch({ type: "patch", patch: { busy } }),
      say,
    }, audible);
  }, [r, dispatch, say]);
}

function useToast(r: StockRefs, dispatch: (a: StockModelAction) => void) {
  return useCallback((text: string, err = false) => {
    if (r.toastTimer.current) clearTimeout(r.toastTimer.current);
    dispatch({ type: "patch", patch: { toast: { text, err } } });
    r.toastTimer.current = setTimeout(() => dispatch({ type: "patch", patch: { toast: null } }), 4000);
  }, [r, dispatch]);
}

function useDerivedList(
  model: StockUploadModel,
  checked: readonly string[],
  rowBadges: RowBadgeState,
  history: StockHistoryMap,
) {
  const items = useMemo(() => model.discovery?.items ?? [], [model.discovery]);
  const visible = useMemo(() => filterAndSortItems({
    items, filter: model.filter, sort: model.sort, rowBadges, history, checked,
  }), [items, model.filter, model.sort, rowBadges, history, checked]);
  const header = useMemo(() => stockHeaderState(visible, checked), [visible, checked]);
  return { items, visible, header };
}

export function useStockUpload(): StockUploadApi {
  const [model, dispatch] = useReducer(reduceStockModel, undefined, initialStockModel);
  const refs = useRef<StockRefs | null>(null);
  if (refs.current === null) refs.current = createStockRefs();
  const r = refs.current;
  const hist = useHistoryActions();
  const selSlice = useAppSlice("stockUpload");
  const presetState = useSyncExternalStore(subscribeStockPresets, getStockPresetState);
  const rowBadges = useSyncExternalStore(subscribeRowBadges, getRowBadgeState);
  const history = useSyncExternalStore(subscribeStockHistory, getStockHistory);
  const say = useToast(r, dispatch);
  const runScan = useScanTrigger(r, dispatch, say);
  useBootEffects(r, presetState.presets, dispatch, runScan);
  const { items, visible, header } = useDerivedList(model, selSlice.checked, rowBadges, history);
  const selection = useStockSelectionActions(visible, hist);
  const badges = useStockRowBadgeActions(hist, say, (id) => {
    if (model.filter.badge === id) dispatch({ type: "filter", patch: { badge: "all" } });
  });
  const ftp = useStockFtpActions({
    presetState, bridgeUrl: model.prefs.bridgeUrl, say,
    setCredSaved: (id, saved) => dispatch({ type: "cred", id, saved }),
    setTestStatus: (testStatus) => dispatch({ type: "patch", patch: { testStatus } }),
  });
  const ops = useStockPanelOps({ model, items, checked: selSlice.checked, presetState, r, dispatch, say, runScan });
  return {
    supported: fsSupported(), model, rootRef: r.root, presetState, rowBadges, history,
    items, visible, checked: selSlice.checked, activeId: selSlice.activeId, header,
    ...selection, ...badges, ...ftp, ...ops,
  };
}

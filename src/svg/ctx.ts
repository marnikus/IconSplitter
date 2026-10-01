// ctx.ts — the one context object the Generate SVG tab's actions consume
// (RULE 24). Owns the mutable refs (root handle, sidecars, abort, API key), the
// toasts, the scan bridge, the boot/autosave effects and the derived lists.
// Building it here keeps useSvgGen itself a five-line composition.

import { useCallback, useEffect, useMemo, useRef, type Dispatch } from "react";
import { providerLabel } from "../lib/svgconfig";
import { usageTotals } from "../lib/svglist";
import { useAppState } from "../state/useAppState";
import { useHistory } from "../state/HistoryProvider";
import { loadApiKey } from "./keystore";
import { isStale, loadCatalog, refreshCatalog } from "./catalog";
import { loadParamMap, paramsFor, saveParamMap, withParams } from "./paramstore";
import { resetNote, resolveModelParams } from "./modelparams";
import { saveConfig, savePrompt } from "./promptstore";
import { saveSvgPrefs } from "./prefsstore";
import { bootSources, scanSources, type ScanSetters } from "./scan";
import { headerState, toListRow, visibleRows } from "./rowmodel";
import type { SvgAction, SvgModel } from "./statemodel";
import type { SvgCtx, SvgSetters } from "./actions";
import type { Discovery } from "./sources";
import type { CatalogModel } from "../lib/modelcaps";
import type { RunProgress, SvgRefs, SvgRow } from "./types";

export function useSvgCtx(model: SvgModel, dispatch: Dispatch<SvgAction>): SvgCtx {
  const refs = useRef(newRefs()).current;
  const hist = useHistory();
  const app = useAppState();
  const say = useSay(dispatch);
  const bridge = useScanBridge(refs, dispatch, say);
  const setCatalog = useCallback((catalog: CatalogModel[] | null) => dispatch({ type: "catalog", catalog }), [dispatch]);
  const derived = useDerived(model, app.svg.checked);
  useSvgBoot(refs, { ...bridge, setCatalog, baseUrl: model.config.baseUrl });
  useModelSync(model, dispatch, say);
  useSvgPersist(model);
  return {
    m: model, dispatch, refs, hist, provider: providerLabel(model.config),
    rows: model.rows, checked: app.svg.checked, activeId: app.svg.activeId,
    say, loadAll: bridge.loadAll, refreshKey: bridge.refreshKey,
    setRootName: bridge.setRootName,
    setDiscovery: bridge.setDiscovery, setBusy: bridge.setBusy, setRootToken: bridge.setRootToken,
    setRows: bridge.setRows, setRowsFn: bridge.setRowsFn,
    setProgress: bridge.setProgress, setProgressFn: bridge.setProgressFn,
    ...derived,
  };
}

/** A toast lives for a few seconds and then clears itself (RULE 9). */
function useSay(dispatch: Dispatch<SvgAction>): (msg: string, err?: boolean) => void {
  return useCallback((msg: string, err = false) => {
    dispatch({ type: "toast", toast: { msg, err } });
    window.setTimeout(() => dispatch({ type: "toast", toast: null }), 4200);
  }, [dispatch]);
}

/** The setters a scan writes through, plus the two bridges the boot needs. */
function useScanBridge(refs: SvgRefs, dispatch: Dispatch<SvgAction>, say: SvgCtx["say"]): SvgSetters {
  const setters = useRef<ScanSetters | null>(null);
  const loadAll = useCallback(() => {
    const target = setters.current;
    if (target !== null) void scanSources(refs, target);
  }, [refs]);
  const refreshKey = useCallback(() => {
    void loadApiKey()
      .then((key) => {
        refs.key.current = key;
        dispatch({ type: "key", key });
      })
      .catch(() => dispatch({ type: "key", key: null }));
  }, [dispatch, refs]);
  // Every writer is memoised on [dispatch]: an unstable one would re-run the
  // boot effect on every render (RULE 24).
  const setRootName = useCallback((name: string) => dispatch({ type: "root", name }), [dispatch]);
  const setDiscovery = useCallback((discovery: Discovery | null) => dispatch({ type: "discovery", discovery }), [dispatch]);
  const setBusy = useCallback((busy: string | null) => dispatch({ type: "busy", busy }), [dispatch]);
  const setRootToken = useCallback(() => dispatch({ type: "root-token" }), [dispatch]);
  const setRows = useCallback((rows: SvgRow[]) => dispatch({ type: "rows", rows }), [dispatch]);
  const setRowsFn = useCallback((fn: (rows: SvgRow[]) => SvgRow[]) => dispatch({ type: "rows-fn", fn }), [dispatch]);
  const setProgress = useCallback((progress: RunProgress | null) => dispatch({ type: "progress", progress }), [dispatch]);
  const setProgressFn = useCallback((fn: (p: RunProgress | null) => RunProgress | null) => dispatch({ type: "progress-fn", fn }), [dispatch]);
  setters.current = { setRootName, setRows, setDiscovery, setBusy, setRootToken, say };
  return {
    loadAll, refreshKey, say, setRootName, setDiscovery, setBusy, setRootToken,
    setRows, setRowsFn, setProgress, setProgressFn,
  };
}

/**
 * Once per mount: restore the remembered folder, the stored key and the cached
 * model list. A stale cache is refreshed in the background — the tab never waits
 * for the network, and a failed refresh leaves the family rules in charge.
 */
function useSvgBoot(refs: SvgRefs, bridge: BootBridge): void {
  const { loadAll, refreshKey, setRootName, setCatalog, baseUrl } = bridge;
  useEffect(() => {
    void bootSources(refs, { setRootName, loadAll, refreshKey });
    const cached = loadCatalog();
    if (cached !== null) setCatalog(cached.models);
    if (cached === null || isStale(cached)) {
      void refreshCatalog(baseUrl, refs.key.current)
        .then((models) => setCatalog(models))
        .catch(() => undefined);
    }
  }, [refs, loadAll, refreshKey, setRootName, setCatalog, baseUrl]);
}

interface BootBridge {
  loadAll: () => void;
  refreshKey: () => void;
  setRootName: (name: string) => void;
  setCatalog: (catalog: CatalogModel[] | null) => void;
  baseUrl: string;
}

/**
 * The one place a model's settings are (re)resolved: on mount, when the model
 * id changes, and when a fresh model list arrives. Whatever the new model
 * refuses is dropped and named in a warning — never silently kept, and never
 * guessed at. Runs once per (model, catalog) pair, so editing a value is safe.
 */
function useModelSync(model: SvgModel, dispatch: Dispatch<SvgAction>, say: SvgCtx["say"]): void {
  const applied = useRef("");
  const key = `${model.config.model}#${model.catalog === null ? "-" : model.catalog.length}`;
  const latest = useRef({ model, dispatch, say, key });
  latest.current = { model, dispatch, say, key };
  useEffect(() => {
    const now = latest.current;
    if (applied.current === now.key) return;
    applied.current = now.key;
    const target = now.model;
    const model_ = target.config.model;
    const { caps, params, reset } = resolveModelParams(model_, target.catalog, paramsFor(loadParamMap(), model_));
    now.dispatch({ type: "caps", caps });
    now.dispatch({ type: "params", params });
    saveParamMap(withParams(loadParamMap(), model_, params));
    const note = resetNote(model_, reset);
    if (note !== null) {
      now.dispatch({ type: "param-note", note });
      now.say(note, true);
    }
  }, [key]);
}

/** Zoom, the card's minimized state, the preview background and the prompt are
    remembered locally (RULE 6). */
function useSvgPersist(model: SvgModel): void {
  useEffect(() => saveSvgPrefs({
    thumbHeight: model.thumb, providerOpen: model.providerOpen, previewBg: model.bg,
  }), [model.thumb, model.providerOpen, model.bg]);
  useEffect(() => saveConfig(model.config), [model.config]);
  useEffect(() => savePrompt(model.prompt), [model.prompt]);
}

/** The filtered/sorted view and its totals, derived from the model only. */
function useDerived(model: SvgModel, checked: string[]): Pick<SvgCtx, "visible" | "totals" | "header" | "affected"> {
  const visible = useMemo(() => visibleRows(model.rows, model.filter, model.sort), [model.rows, model.filter, model.sort]);
  const totals = useMemo(() => usageTotals(visible.map(toListRow)), [visible]);
  const header = useMemo(() => headerState(visible, checked), [visible, checked]);
  const affected = useMemo(() => visible.filter((r) => checked.includes(r.source.id)).map((r) => r.source.id), [visible, checked]);
  return { visible, totals, header, affected };
}

function newRefs(): SvgRefs {
  return { root: { current: null }, sidecars: new Map(), abort: { current: null }, key: { current: null } };
}

/** Re-exported so the panel can name the row type without a second import. */
export type { SvgRow };

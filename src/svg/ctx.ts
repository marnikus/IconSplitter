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
import { saveConfig, savePrompt } from "./promptstore";
import { saveSvgPrefs } from "./prefsstore";
import { bootSources, scanSources, type ScanSetters } from "./scan";
import { headerState, toListRow, visibleRows } from "./rowmodel";
import type { SvgAction, SvgModel } from "./statemodel";
import type { SvgCtx, SvgSetters } from "./actions";
import type { SvgRefs, SvgRow } from "./types";

export function useSvgCtx(model: SvgModel, dispatch: Dispatch<SvgAction>): SvgCtx {
  const refs = useRef(newRefs()).current;
  const hist = useHistory();
  const app = useAppState();
  const say = useSay(dispatch);
  const bridge = useScanBridge(refs, dispatch, say);
  const derived = useDerived(model, app.svg.checked);
  useSvgBoot(refs, bridge);
  useSvgPersist(model);
  return {
    m: model, dispatch, refs, hist, provider: providerLabel(model.config),
    rows: model.rows, checked: app.svg.checked, activeId: app.svg.activeId,
    say, loadAll: bridge.loadAll, refreshKey: bridge.refreshKey,
    setRootName: bridge.setRootName,
    setDiscovery: bridge.setDiscovery, setBusy: bridge.setBusy,
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
    void loadApiKey().then((key) => {
      refs.key.current = key;
      dispatch({ type: "key", key });
    });
  }, [dispatch, refs]);
  setters.current = {
    setRootName: (name) => dispatch({ type: "root", name }),
    setRows: (rows) => dispatch({ type: "rows", rows }),
    setDiscovery: (discovery) => dispatch({ type: "discovery", discovery }),
    setBusy: (busy) => dispatch({ type: "busy", busy }),
    say,
  };
  return {
    loadAll, refreshKey, say,
    setRootName: (name) => dispatch({ type: "root", name }),
    setDiscovery: (discovery) => dispatch({ type: "discovery", discovery }),
    setBusy: (busy) => dispatch({ type: "busy", busy }),
    setRows: (rows) => dispatch({ type: "rows", rows }),
    setRowsFn: (fn) => dispatch({ type: "rows-fn", fn }),
    setProgress: (progress) => dispatch({ type: "progress", progress }),
    setProgressFn: (fn) => dispatch({ type: "progress-fn", fn }),
  };
}

/** Once per mount: restore the remembered folder and the stored key. */
function useSvgBoot(refs: SvgRefs, bridge: Pick<SvgCtx, "loadAll" | "refreshKey" | "setRootName">): void {
  const { loadAll, refreshKey, setRootName } = bridge;
  useEffect(() => {
    void bootSources(refs, { setRootName, loadAll, refreshKey });
  }, [refs, loadAll, refreshKey, setRootName]);
}

/** Zoom, provider settings and the prompt are remembered locally (RULE 6). */
function useSvgPersist(model: SvgModel): void {
  useEffect(() => saveSvgPrefs({ thumbHeight: model.thumb }), [model.thumb]);
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

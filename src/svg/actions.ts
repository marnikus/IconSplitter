// actions.ts — what the user can do on the Generate SVG tab (RULE 2/4/24).
// Every action is a small hook over one context object: the current model
// snapshot, the dispatch that changes it, the mutable refs (root handle,
// sidecars, abort, key) and the shared history. Grouped by concern so no hook
// grows past RULE 18 and the panel never holds state of its own.

import { useCallback, useRef, type Dispatch } from "react";
import type { ReviewStatus } from "../lib/svgfile";
import { parseConfig, type SvgConfig } from "../lib/svgconfig";
import { parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { DEFAULT_SVG_PROMPT } from "../lib/svgprompt";
import type { SvgListFilter, SvgSort, UsageTotals } from "../lib/svglist";
import { pickDirectory } from "../batch/picker";
import { getAppState, patchSvg } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { useKeyActions } from "./keyactions";
import { refreshCatalog } from "./catalog";
import { loadParamMap, saveParamMap, withParams } from "./paramstore";
import { sanitizeParams, type SamplingParams } from "../lib/modelcaps";
import { rememberRoot, scanSources } from "./scan";
import { decideReview, useReviewApplier } from "./reviewact";
import { logRulesEdit } from "./runlog";
import { message } from "./runner";
import { useRunActions } from "./runflow";
import { useCodeActions } from "./codeactions";
import type { SvgAction, SvgModel } from "./statemodel";
import type { RunProgress, SvgRefs, SvgRow } from "./types";
import type { Discovery } from "./sources";

/** Everything an action may touch. One object, passed everywhere. */
export interface SvgCtx {
  m: SvgModel;
  dispatch: Dispatch<SvgAction>;
  refs: SvgRefs;
  hist: HistoryApi;
  rows: SvgRow[];
  visible: SvgRow[];
  checked: string[];
  activeId: string | null;
  header: "none" | "some" | "all";
  affected: string[];
  totals: UsageTotals;
  /** Requests the current selection becomes at the effective per-request size. */
  requests: number;
  provider: string;
  say: (msg: string, err?: boolean) => void;
  loadAll: () => void;
  refreshKey: () => void;
  setRootName: (name: string) => void;
  setDiscovery: (d: Discovery | null) => void;
  setBusy: (b: string | null) => void;
  setRootToken: () => void;
  setRows: (rows: SvgRow[]) => void;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  setProgress: (p: RunProgress | null) => void;
  setProgressFn: (fn: (p: RunProgress | null) => RunProgress | null) => void;
}

/** The write half of the context, wired by svg/ctx from the reducer. */
export type SvgSetters = Pick<SvgCtx,
  "say" | "loadAll" | "refreshKey" | "setRootName" | "setDiscovery" | "setBusy"
  | "setRootToken" | "setRows" | "setRowsFn" | "setProgress" | "setProgressFn">;

/** The public action surface of the tab, in the order the panel uses them. */
export interface SvgActions {
  readCode: (id: string, version: number) => Promise<string | null>;
  chooseRoot: () => void;
  rescan: () => void;
  setThumb: (px: number) => void;
  setPreviewBg: (bg: PreviewBackground) => void;
  setFilter: (patch: Partial<SvgListFilter>) => void;
  setSort: (sort: SvgSort) => void;
  setConfig: (patch: Partial<SvgConfig>) => void;
  setProviderOpen: (open: boolean) => void;
  setParams: (patch: Partial<SamplingParams>) => void;
  refreshModels: () => void;
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
  saveKey: (key: string) => void;
  forgetKey: () => void;
  toggleCheck: (id: string) => void;
  selectVisible: () => void;
  deselectAll: () => void;
  setActive: (id: string) => void;
  decide: (ids: string[], decision: ReviewStatus) => void;
  requestGenerate: (ids: string[]) => void;
  cancelRun: () => void;
  confirmGenerate: () => void;
  dismissDialog: () => void;
  showCode: (id: string, version: number) => void;
  showHistory: (id: string) => void;
  copyCode: (id: string, version: number) => void;
  openLocation: (id: string) => void;
}

/** One hook's share of the action surface, so the composition stays typed. */
export type Slice<K extends keyof SvgActions> = Pick<SvgActions, K>;

/** The undo path must live where the model does (RULE 12). */
export function useSvgActions(ctx: SvgCtx): SvgActions {
  useReviewApplier(ctx);
  return {
    ...useSourceActions(ctx),
    ...useViewActions(ctx),
    ...useModelActions(ctx),
    ...useSelectActions(ctx),
    ...useKeyActions(ctx),
    ...useRunActions(ctx),
    ...useCodeActions(ctx),
  };
}

function useSourceActions(ctx: SvgCtx): Slice<"chooseRoot" | "rescan"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const chooseRoot = useCallback(() => {
    void (async () => {
      const c = latest.current;
      const handle = await pickDirectory();
      if (!handle) return c.say("Folder picking needs Chrome or Edge — or was cancelled", true);
      c.refs.root.current = handle;
      c.dispatch({ type: "root", name: handle.name });
      await rememberRoot(handle);
      await scanSources(c.refs, c);
      c.say(`Approved sources scanned from ${handle.name}`);
    })();
  }, []);
  const rescan = useCallback(() => {
    void scanSources(latest.current.refs, latest.current);
  }, []);
  return { chooseRoot, rescan };
}

function useViewActions(ctx: SvgCtx): Slice<"setThumb" | "setPreviewBg" | "setProviderOpen" | "setFilter" | "setSort" | "setPrompt" | "resetPrompt"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setThumb = useCallback((px: number) => latest.current.dispatch({ type: "thumb", px }), []);
  // validated on the way in as well as on the way out (RULE 13)
  const setPreviewBg = useCallback((bg: PreviewBackground) => latest.current.dispatch({ type: "bg", bg: parsePreviewBackground(bg) }), []);
  const setFilter = useCallback((patch: Partial<SvgListFilter>) => latest.current.dispatch({ type: "filter", patch }), []);
  const setSort = useCallback((sort: SvgSort) => latest.current.dispatch({ type: "sort", sort }), []);
  const setProviderOpen = useCallback((open: boolean) => latest.current.dispatch({ type: "provider-open", open }), []);
  const setPrompt = useCallback((text: string) => {
    latest.current.dispatch({ type: "prompt", prompt: text });
    logRulesEdit(text);
  }, []);
  const resetPrompt = useCallback(() => {
    const c = latest.current;
    c.dispatch({ type: "prompt", prompt: DEFAULT_SVG_PROMPT });
    c.say("Default prompt restored");
  }, []);
  return { setThumb, setPreviewBg, setProviderOpen, setFilter, setSort, setPrompt, resetPrompt };
}

/**
 * Model and sampling. Changing the model is only a config write: ctx's sync
 * effect re-reads the new model's capabilities and stored settings and warns
 * about anything it had to drop.
 */
function useModelActions(ctx: SvgCtx): Slice<"setConfig" | "setParams" | "refreshModels"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setConfig = useCallback((patch: Partial<SvgConfig>) => {
    const c = latest.current;
    c.dispatch({ type: "config", config: parseConfig({ ...c.m.config, ...patch }) });
  }, []);
  const setParams = useCallback((patch: Partial<SamplingParams>) => {
    const c = latest.current;
    const { params, reset } = sanitizeParams(c.m.caps, { ...c.m.params, ...patch });
    c.dispatch({ type: "params", params });
    saveParamMap(withParams(loadParamMap(), c.m.config.model, params));
    if (reset.length > 0) c.say(reset.join("; "), true);
  }, []);
  const refreshModels = useCallback(() => {
    void (async () => {
      const c = latest.current;
      try {
        const models = await refreshCatalog(c.m.config.baseUrl, c.refs.key.current);
        // Storing the list is enough: the sync effect re-resolves the caps.
        c.dispatch({ type: "catalog", catalog: models });
        c.say(`Model list refreshed — ${models.length} models`);
      } catch (error) {
        c.say(message(error), true);
      }
    })();
  }, []);
  return { setConfig, setParams, refreshModels };
}

function useSelectActions(ctx: SvgCtx): Slice<"toggleCheck" | "selectVisible" | "deselectAll" | "setActive" | "decide"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleCheck = useCallback((id: string) => {
    const c = latest.current;
    const ids = c.checked.includes(id) ? c.checked.filter((x) => x !== id) : [...c.checked, id];
    editChecked(c, ids, null);
  }, []);
  const selectVisible = useCallback(() => {
    const c = latest.current;
    editChecked(c, [...new Set([...c.checked, ...c.visible.map((r) => r.source.id)])], null);
  }, []);
  const deselectAll = useCallback(() => editChecked(latest.current, [], null), []);
  const setActive = useCallback((id: string) => patchSvg({ activeId: id }), []);
  const decide = useCallback((ids: string[], decision: ReviewStatus) => {
    void decideReview(latest.current, ids, decision);
  }, []);
  return { toggleCheck, selectVisible, deselectAll, setActive, decide };
}

/** One selection gesture = one entry holding the whole selection (RULE 12). */
function editChecked(c: SvgCtx, ids: string[], active: string | null): void {
  const before = getAppState().svg.checked;
  patchSvg({ checked: ids });
  if (active !== null) patchSvg({ activeId: active });
  c.hist.push({
    type: "checked",
    label: ids.length === 0 ? "Clear selection" : `Select ${ids.length} source${ids.length === 1 ? "" : "s"}`,
    origin: getAppState().tab, ids, before: { ids: before }, after: { ids },
  });
}

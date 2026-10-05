// actions.ts — what the user can do on the Generate SVG tab (RULE 2/4/24).
// Every action is a small hook over one context object: the current model
// snapshot, the dispatch that changes it, the mutable refs (root handle,
// sidecars, abort, key) and the shared history. Grouped by concern so no hook
// grows past RULE 18 and the panel never holds state of its own.

import { useCallback, useRef, type Dispatch } from "react";
import type { ReviewStatus } from "../lib/svgfile";
import { planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { clampImagesPerRequest, parseConfig, type SvgConfig } from "../lib/svgconfig";
import { parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { DEFAULT_SVG_PROMPT } from "../lib/svgprompt";
import type { SvgListFilter, SvgSort, UsageTotals } from "../lib/svglist";
import type { DirHandleLike } from "../lib/fs";
import { pickDirectory } from "../batch/picker";
import { getAppState, patchSvg } from "../state/appstore";
import type { HistoryApi } from "../state/HistoryProvider";
import { useKeyActions } from "./keyactions";
import { refreshCatalog } from "./catalog";
import { loadParamMap, saveParamMap, withParams } from "./paramstore";
import { sanitizeParams, type SamplingParams } from "../lib/modelcaps";
import { rememberRoot, scanSources } from "./scan";
import { decideReview, useReviewApplier } from "./reviewact";
import { onRunEvent, reloadSidecars, summaryLine } from "./runstate";
import { message, runGeneration } from "./runner";
import { toBatchSource } from "./sources";
import { useCodeActions } from "./codeactions";
import type { SvgAction, SvgModel } from "./statemodel";
import type { Dialog, RunProgress, SvgRefs, SvgRow } from "./types";
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
  const setPrompt = useCallback((text: string) => latest.current.dispatch({ type: "prompt", prompt: text }), []);
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

function useRunActions(ctx: SvgCtx): Slice<"requestGenerate" | "cancelRun" | "confirmGenerate" | "dismissDialog"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const requestGenerate = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = guard(c, ids);
    if (why !== null) return c.say(why, true);
    // The plan the user confirms is the plan the runner will send (RULE 10):
    // one splitter, one effective per-request size, validated before the dialog.
    const problems = validateBatchPlan(planOf(c, ids), perRequestOf(c));
    if (problems.length > 0) return c.say(problems[0], true);
    const dialog: Dialog = { kind: "confirm", ids };
    c.dispatch({ type: "dialog", dialog });
  }, []);
  const cancelRun = useCallback(() => {
    const c = latest.current;
    c.refs.abort.current?.abort();
    c.say("Cancelling — finished results are kept");
  }, []);
  const confirmGenerate = useCallback(() => {
    void confirmRun(latest.current);
  }, []);
  const dismissDialog = useCallback(() => latest.current.dispatch({ type: "dialog", dialog: null }), []);
  return { requestGenerate, cancelRun, confirmGenerate, dismissDialog };
}

/** The one split the confirmation and the run both see (RUN-1). */
function planOf(c: SvgCtx, ids: string[]): BatchPlan[] {
  const sources = c.rows.filter((r) => ids.includes(r.source.id)).map((r) => toBatchSource(r.source));
  return planBatches(sources, perRequestOf(c));
}

/**
 * Icons one request carries: the user's configured size, nothing else. The
 * reasoning tier changes only how long silence is tolerated (2026-10-05 D1).
 */
function perRequestOf(c: SvgCtx): number {
  return clampImagesPerRequest(c.m.config.imagesPerRequest);
}

/** Why a run cannot start, or null when it can. Never a partial reason. */
function guard(c: SvgCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one approved source";
  if (c.refs.root.current === null) return "Pick the source folder first";
  if (c.refs.key.current === null) return "Add your Requesty API key first — it stays on this device";
  return null;
}

/** One confirmation = one run: a second click while running is ignored. */
async function confirmRun(ctx: SvgCtx): Promise<void> {
  const dialog = ctx.m.dialog;
  if (dialog === null || dialog.kind !== "confirm" || ctx.m.running) return;
  const ids = dialog.ids;
  ctx.dispatch({ type: "dialog", dialog: null });
  const controller = new AbortController();
  ctx.refs.abort.current = controller;
  ctx.dispatch({ type: "running", running: true });
  ctx.setRowsFn((rows) => rows.map((r) => (ids.includes(r.source.id) ? { ...r, status: "generating", running: true, error: null } : r)));
  const sources = ctx.rows.filter((r) => ids.includes(r.source.id)).map((r) => r.source);
  const summary = await runGeneration({
    root: ctx.refs.root.current as DirHandleLike,
    apiKey: ctx.refs.key.current ?? "",
    config: ctx.m.config, caps: ctx.m.caps, params: ctx.m.params, prompt: ctx.m.prompt, sources,
    sidecars: ctx.refs.sidecars, signal: controller.signal,
    onEvent: (event) => onRunEvent(event, ctx),
  });
  ctx.dispatch({ type: "running", running: false });
  // The finished run stays visible: its per-request outcomes are the record of
  // what was sent, what it cost and what failed (the batch strip shows it).
  ctx.refs.abort.current = null;
  await reloadSidecars(ctx.refs, sources, ctx);
  ctx.say(summaryLine(summary), summary.saved === 0 && summary.problems.length > 0);
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

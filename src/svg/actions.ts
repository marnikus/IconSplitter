// actions.ts — Generate SVG tab actions
import { useCallback, useRef, type Dispatch } from "react";
import { log } from "../log/logstore";
import type { ReviewStatus } from "../lib/svgfile";
import { message } from "./runner";
import { validateBatchPlan } from "../lib/svgbatch";
import { parseConfig, type SvgConfig } from "../lib/svgconfig";
import type { Connection, ConnectionKind } from "../lib/svgconnections";
import { useConnectionActions } from "./connectionactions";
import { useImgRegenActions } from "./imgactions";
import type { PreparedImageRun } from "./imgprepare";
import { parsePreviewBackground, type PreviewBackground } from "../lib/svgbackground";
import { clampStroke } from "../lib/previewstroke";
import type { SvgListFilter, SvgSort, UsageTotals } from "../lib/svglist";
import { pickFolderFor } from "../ui/pickroot";
import { getAppState, patchSvg } from "../state/appstore";
import { applyRowGesture, sameRowSelection, setChecked, toggleChecked, type RowSelection, type SelectIntent } from "../lib/reviewselect";
import type { HistoryApi } from "../state/HistoryProvider";
import { useKeyActions } from "./keyactions";
import { useSvgPromptActions, type SvgPromptActions } from "./promptactions";
import { refreshCatalog } from "./catalog";
import { loadParamMap, saveParamMap, withParams } from "./paramstore";
import { sanitizeParams, type SamplingParams } from "../lib/modelcaps";
import { rememberRoot, scanSources } from "./scan";
import { decideReview, useReviewApplier } from "./reviewact";
import { guard, perRequestOf, planOf } from "./runplan";
import { busy, confirmRun, dropQueueForCancel, dropWaiting } from "./runcontrol";
import { nextGenerate, regenerateNext } from "./runqueuepath";
import type { CancelNote } from "./runcontext";
import type { ConfirmedBatch } from "./types";
import { useCodeActions } from "./codeactions";
import type { SvgAction, SvgModel } from "./statemodel";
import type { Dialog, Placement, RunProgress, SvgOperation, SvgRefs, SvgRow } from "./types";
import { idsWithGeneratedSvg } from "./rowmodel";
import type { Discovery } from "./sources";
import { MAIN_PLAN, regenPlanFromPreset, type RegenPlan } from "../lib/svgregen";
import { loadRegenBatchPref } from "./regenprefs";
export interface SvgCtx {
  m: SvgModel; dispatch: Dispatch<SvgAction>; refs: SvgRefs; hist: HistoryApi;
  rows: SvgRow[]; visible: SvgRow[]; checked: string[]; activeId: string | null;
  header: "none" | "some" | "all"; affected: string[]; totals: UsageTotals; requests: number;
  provider: string; say: (msg: string, err?: boolean) => void; loadAll: () => void; refreshKey: () => void;
  setRootName: (name: string) => void; setDiscovery: (d: Discovery | null) => void; setBusy: (b: string | null) => void;
  setRootToken: () => void; setRows: (rows: SvgRow[]) => void; setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  setProgress: (p: RunProgress | null) => void; setProgressFn: (fn: (p: RunProgress | null) => RunProgress | null) => void;
  setCurrent: (id: string | null) => void;
}
export type SvgSetters = Pick<SvgCtx, "say" | "loadAll" | "refreshKey" | "setRootName" | "setDiscovery" | "setBusy" | "setRootToken" | "setRows" | "setRowsFn" | "setProgress" | "setProgressFn" | "setCurrent">;
export interface SvgActions extends SvgPromptActions {
  readCode: (id: string, version: number) => Promise<string | null>;
  chooseRoot: () => void; rescan: () => void; setThumb: (px: number) => void; setPreviewBg: (bg: PreviewBackground) => void;
  setPreviewStroke: (px: number | null) => void;
  setFilter: (patch: Partial<SvgListFilter>) => void; setSort: (sort: SvgSort) => void; setConfig: (patch: Partial<SvgConfig>) => void;
  switchConnection: (id: string) => void; addConnection: () => void; removeConnection: () => void;
  setConnectionMeta: (patch: { name?: string; kind?: ConnectionKind }) => void;
  setImage: (patch: Partial<Connection["image"]>) => void;
  setProviderOpen: (open: boolean) => void; setParams: (patch: Partial<SamplingParams>) => void; refreshModels: () => void;
  saveKey: (key: string) => void; forgetKey: () => void; toggleCheck: (id: string) => void; selectVisible: () => void;
  uncheckVisible: () => void; deselectAll: () => void; checkActive: () => void; uncheckActive: () => void;
  selectRow: (id: string, intent: SelectIntent) => void; setActive: (id: string) => void;
  decide: (ids: string[], decision: ReviewStatus) => void;
  requestGenerate: (ids: string[], placement?: Placement, operation?: SvgOperation) => void;
  requestImageRegen: (ids: string[]) => void; confirmImageRegen: (prepared?: PreparedImageRun | null) => void; stopImageRegen: () => void;
  setImageVersion: (id: string, version: number | null) => void;
  applyImageReview: () => void; discardImageReview: () => void;
  dismissImageJournal: (id: string) => void; retryImageUnknown: (id: string) => void;
  regenerateSelected: (ids: string[]) => void; cancelRun: () => void; confirmGenerate: (batch: ConfirmedBatch) => void;
  dismissDialog: () => void; showCode: (id: string, version: number) => void; showHistory: (id: string) => void;
  dropQueued: (itemId: string) => void; preferVersion: (id: string, version: number) => Promise<string | null>;
  copyCode: (id: string, version: number) => void; openLocation: (id: string) => void;
}
export type Slice<K extends keyof SvgActions> = Pick<SvgActions, K>;
export function useSvgActions(ctx: SvgCtx): SvgActions {
  useReviewApplier(ctx);
  return {
    ...useSourceActions(ctx), ...useViewActions(ctx), ...useModelActions(ctx), ...useSelectActions(ctx), ...useConnectionActions(ctx), ...useImgRegenActions(ctx),
    ...useKeyActions(ctx), ...useRunActions(ctx), ...useQueueActions(ctx), ...useCodeActions(ctx), ...useSvgPromptActions(ctx),
  };
}
function useSourceActions(ctx: SvgCtx): Slice<"chooseRoot" | "rescan"> {
  const latest = useRef(ctx); latest.current = ctx;
  const chooseRoot = useCallback(() => {
    void (async () => {
      const c = latest.current;
      const picked = await pickFolderFor((h) => { c.refs.root.current = h; c.dispatch({ type: "root", name: h.name }); void rememberRoot(h); });
      if (!picked) return c.say("Folder picking needs Chrome or Edge — or was cancelled", true);
      const cap = picked.message === null ? "" : " · full path captured";
      log({ feature: "svg", action: "root-picked", detail: picked.handle.name + cap });
      c.refreshKey(); // a fresh pick never went through the remembered-handle boot: load the stored device key too
      await scanSources(c.refs, c);
      c.say(picked.message ?? `Approved sources scanned from ${picked.handle.name}`);
    })();
  }, []);
  const rescan = useCallback(() => { void scanSources(latest.current.refs, latest.current); }, []);
  return { chooseRoot, rescan };
}
function useViewActions(ctx: SvgCtx): Slice<"setThumb" | "setPreviewBg" | "setPreviewStroke" | "setProviderOpen" | "setFilter" | "setSort"> {
  const latest = useRef(ctx); latest.current = ctx;
  const setThumb = useCallback((px: number) => latest.current.dispatch({ type: "thumb", px }), []);
  const setPreviewBg = useCallback((bg: PreviewBackground) => latest.current.dispatch({ type: "bg", bg: parsePreviewBackground(bg) }), []);
  const setPreviewStroke = useCallback((px: number | null) => latest.current.dispatch({ type: "stroke", px: px === null ? null : clampStroke(px) }), []);
  const setFilter = useCallback((patch: Partial<SvgListFilter>) => latest.current.dispatch({ type: "filter", patch }), []);
  const setSort = useCallback((sort: SvgSort) => latest.current.dispatch({ type: "sort", sort }), []);
  const setProviderOpen = useCallback((open: boolean) => latest.current.dispatch({ type: "provider-open", open }), []);
  return { setThumb, setPreviewBg, setPreviewStroke, setProviderOpen, setFilter, setSort };
}
function useModelActions(ctx: SvgCtx): Slice<"setConfig" | "setParams" | "refreshModels"> {
  const latest = useRef(ctx); latest.current = ctx;
  const setConfig = useCallback((patch: Partial<SvgConfig>) => {
    const c = latest.current;
    c.dispatch({ type: "config", config: parseConfig({ ...c.m.config, ...patch }) });
    log({ feature: "svg", action: "config-changed", detail: Object.keys(patch).join(", "), data: patch });
  }, []);
  const setParams = useCallback((patch: Partial<SamplingParams>) => {
    const c = latest.current;
    const { params, reset } = sanitizeParams(c.m.caps, { ...c.m.params, ...patch });
    c.dispatch({ type: "params", params });
    log({ feature: "svg", action: "sampling-changed", detail: Object.keys(patch).join(", "), data: patch });
    saveParamMap(withParams(loadParamMap(), c.m.config.model, params));
    if (reset.length > 0) c.say(reset.join("; "), true);
  }, []);
  const refreshModels = useCallback(() => void refreshModelsNow(latest), []);
  return { setConfig, setParams, refreshModels };
}
async function refreshModelsNow(latest: { current: SvgCtx }): Promise<void> {
  const c = latest.current;
  try {
    const models = await refreshCatalog(c.m.config.baseUrl, c.refs.key.current);
    c.dispatch({ type: "catalog", catalog: models });
    c.say(`Model list refreshed — ${models.length} models`);
  } catch (error) { c.say(message(error), true); }
}
function useSelectActions(ctx: SvgCtx): Slice<"toggleCheck" | "selectVisible" | "uncheckVisible" | "deselectAll" | "checkActive" | "uncheckActive" | "selectRow" | "setActive" | "decide"> {
  const latest = useRef(ctx); latest.current = ctx;
  return { ...useSvgChecks(latest), ...useSvgRowActions(latest), decide: useDecide(latest) };
}

function useSvgChecks(latest: { current: SvgCtx }) {
  const toggleCheck = useCallback((id: string) => {
    const before = svgSelection();
    editChecked(latest.current, { ...before, checked: toggleChecked(before.checked, id) }, "Toggle row", [id]);
  }, [latest]);
  const selectVisible = useCallback(() => {
    const before = svgSelection();
    const ids = latest.current.visible.map((r) => r.source.id);
    editChecked(latest.current, { ...before, checked: setChecked(before.checked, ids, true) }, "Select visible", ids);
  }, [latest]);
  const uncheckVisible = useCallback(() => {
    const before = svgSelection();
    const ids = latest.current.visible.map((r) => r.source.id);
    editChecked(latest.current, { ...before, checked: setChecked(before.checked, ids, false) }, "Deselect visible", ids);
  }, [latest]);
  const deselectAll = useCallback(() => {
    const before = svgSelection();
    editChecked(latest.current, { ...before, checked: [] }, "Deselect all", before.checked);
  }, [latest]);
  return { toggleCheck, selectVisible, uncheckVisible, deselectAll,
    checkActive: useCheckActive(latest), uncheckActive: useUncheckActive(latest) };
}

function useSvgRowActions(latest: { current: SvgCtx }) {
  const selectRow = useCallback((id: string, intent: SelectIntent) => {
    const before = svgSelection();
    const visibleIds = latest.current.visible.map((r) => r.source.id);
    const after = applyRowGesture(before, { id, intent, visibleIds });
    editChecked(latest.current, after, intent === "replace" ? "Select row" : "Select range", [id]);
  }, [latest]);
  const setActive = useCallback((id: string) => {
    const before = svgSelection();
    editChecked(latest.current, { ...before, active: id }, "Move active row", [id]);
  }, [latest]);
  return { selectRow, setActive };
}

function useCheckActive(latest: { current: SvgCtx }) {
  return useCallback(() => {
    const before = svgSelection();
    if (!before.active) return;
    editChecked(latest.current, { ...before, checked: setChecked(before.checked, [before.active], true) }, "Select active row", [before.active]);
  }, [latest]);
}
function useUncheckActive(latest: { current: SvgCtx }) {
  return useCallback(() => {
    const before = svgSelection();
    if (!before.active) return;
    editChecked(latest.current, { ...before, checked: setChecked(before.checked, [before.active], false) }, "Deselect active row", [before.active]);
  }, [latest]);
}
function useDecide(latest: { current: SvgCtx }) {
  return useCallback((ids: string[], decision: ReviewStatus) => {
    log({ feature: "svg", action: "review-decided", detail: `${ids.length} → ${decision}` });
    void decideReview(latest.current, ids, decision);
  }, [latest]);
}
function useRunActions(ctx: SvgCtx): Slice<"requestGenerate" | "regenerateSelected" | "dismissDialog"> {
  const latest = useRef(ctx); latest.current = ctx;
  const requestGenerate = useCallback((ids: string[], placement: Placement = "back", operation: SvgOperation = "generate") => {
    const c = latest.current;
    const regenForGuard: RegenPlan | null = operation === "regenerate" ? dummyRegen(c) : null;
    const why = guard(c, ids, regenForGuard);
    if (why !== null) return c.say(why, true);
    const perReq = perRequestOf(c, regenForGuard);
    const problems = validateBatchPlan(planOf(c, ids, regenForGuard), perReq);
    if (problems.length > 0) return c.say(problems[0], true);
    if (placement === "front" && busy(c)) {
      if (operation === "regenerate") void regenerateNext(c, ids);
      else nextGenerate(c, ids);
      return;
    }
    const dialog: Dialog = { kind: "confirm", ids, operation };
    log({ feature: "svg", action: "confirm-opened", detail: `${ids.length} · ${operation}` });
    c.dispatch({ type: "dialog", dialog });
  }, []);
  const regenerateSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    const eligible = idsWithGeneratedSvg(c.rows, ids);
    if (eligible.length === 0) return c.say("Select a source with an existing valid SVG to regenerate", true);
    requestGenerate(eligible, "back", "regenerate");
  }, [requestGenerate]);
  const dismissDialog = useCallback(() => latest.current.dispatch({ type: "dialog", dialog: null }), []);
  return { requestGenerate, regenerateSelected, dismissDialog };
}
function useQueueActions(ctx: SvgCtx): Slice<"confirmGenerate" | "cancelRun" | "dropQueued"> {
  const latest = useRef(ctx); latest.current = ctx;
  const confirmGenerate = useCallback((batch: ConfirmedBatch) => { void confirmRun(latest.current, batch); }, []);
  const cancelRun = useCallback(() => {
    const c = latest.current;
    log({ level: "warn", feature: "svg", action: "cancel-requested", detail: "cancel — keep finished" });
    const dropped = dropQueueForCancel(c);
    c.refs.abort.current?.abort({ dropped } satisfies CancelNote);
    c.dispatch({ type: "current", id: null });
    c.say(dropped === 0 ? "Cancelling — finished results are kept" : `Cancelling — kept, ${dropped} batch${dropped === 1 ? "" : "es"} dropped`);
  }, []);
  const dropQueued = useCallback((itemId: string) => {
    const c = latest.current;
    c.say(`Queued batch dropped — ${dropWaiting(c, itemId)} still waiting`);
  }, []);
  return { confirmGenerate, cancelRun, dropQueued };
}
function svgSelection(): RowSelection {
  const { checked, activeId, anchorId } = getAppState().svg;
  return { checked, active: activeId, anchor: anchorId };
}

function editChecked(c: SvgCtx, after: RowSelection, label: string, touched: string[]): void {
  const before = svgSelection();
  if (sameRowSelection(before, after)) return;
  patchSvg({ checked: after.checked, activeId: after.active, anchorId: after.anchor });
  c.hist.push({
    type: "svgChecked", label, origin: getAppState().tab, ids: touched,
    before: { ids: before.checked, anchor: before.anchor, active: before.active },
    after: { ids: after.checked, anchor: after.anchor, active: after.active },
  });
}
function dummyRegen(c: SvgCtx): RegenPlan {
  const found = c.m.presets.find((p) => p.text.trim() !== "");
  const plan = regenPlanFromPreset(found ?? null, loadRegenBatchPref().count);
  return plan.ok ? plan.plan : MAIN_PLAN;
}

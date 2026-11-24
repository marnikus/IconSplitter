// useSvgBuilder.ts — the only hook the builder panel calls. It composes the
// boot, persistence, computed projection and action slices into one API.
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { toSlots } from "../lib/svgBuilder/merges";
import { useAppSlice } from "../state/useAppState";
import { useOptionalHistory } from "../state/HistoryProvider";
import type { BuilderIconAsset, BuilderListView, SelectionRecipe, SheetConfig, SheetDocument, SheetLayout } from "../lib/svgBuilder/types";
import { builderReducer, initialBuilderModel, type BuilderModel } from "./model";
import { useBuilderBoot } from "./useBuilderBoot";
import { useBuilderPersistence } from "./useBuilderPersistence";
import { useBuilderComputed, type BuilderComputed } from "./useBuilderComputed";
import { useBuilderActions } from "./useBuilderActions";
import { bindBuilderSvgEdit } from "./iconedit";
import { useArtboardUndo } from "./useArtboardUndo";
import { useSheetFileMirror } from "./useSheetFileMirror";
import type { BuilderActions } from "./actiontypes";

export interface BuilderApi extends BuilderModel, BuilderComputed {
  checked: readonly string[];
  activeId: string | null;
  anchorId: string | null;
  actions: BuilderActions;
}

export function useSvgBuilder(): BuilderApi {
  const [model, rawDispatch] = useReducer(builderReducer, undefined, initialBuilderModel);
  const patch = useCallback((value: Partial<BuilderModel>) => rawDispatch({ type: "patch", patch: value }), []);
  const stored = useAppSlice("builder");
  // big icons (2026-11-23): the app stores placements by grid position; everything here sees slots (merges.ts)
  const slots = useMemo(() => toSlots(stored.checked, model.config.grid), [stored.checked, model.config.grid]);
  const slice = useMemo(() => ({ ...stored, checked: slots as string[] }), [stored, slots]);
  const hist = useOptionalHistory();
  const boot = useBuilderBoot(patch, model.supported);
  useBuilderPersistence(model, patch);
  const computed = useBuilderComputed(model, slice.checked, patch);
  const actions = useBuilderActions({ model, computed, boot, slice, hist, patch });
  // the grid's size, not the drawn cells: combining / breaking a big icon never grows or truncates the sheet (2026-11-23)
  useAutoPlacement(actions, computed.assets, model.config.grid.columns * model.config.grid.rows);
  useIconEditBinding(model, computed, patch);
  useArtboardUndo(model, actions);
  useSheetJsonSync(model, slice.checked, actions);
  useSheetFileMirror(model, actions); // before auto-register: a folder's first full file check is queued first
  useAutoRegister(model, actions);
  return {
    ...model, ...computed,
    checked: slice.checked, activeId: slice.activeId, anchorId: slice.anchorId, actions,
  };
}

/** First scan → draw the recipe once (and prune stale ids); a cell-count change → grow / truncate. */
function useAutoPlacement(actions: BuilderActions, assets: readonly BuilderIconAsset[], capacity: number): void {
  useEffect(() => { actions.autoPlace(); }, [actions, assets]);
  const lastCapacity = useRef(capacity);
  useEffect(() => {
    if (lastCapacity.current === capacity) return;
    lastCapacity.current = capacity;
    actions.fitSelection();
  }, [actions, capacity]);
}

/** The open artboard's sheet.json follows the edits (2026-11-16), one write per pause. */
function useSheetJsonSync(model: BuilderModel, placedIds: readonly string[], actions: BuilderActions): void {
  const folder = model.artboards.find((a) => a.id === model.editingArtboardId)?.folder ?? null;
  useEffect(() => {
    if (folder === null) return;
    const t = setTimeout(() => actions.syncSheetJson(), 600);
    return () => clearTimeout(t);
  }, [actions, folder, model.config, placedIds, model.lockedIds, model.seed, model.recipe, model.metadata]);
}

/** After each scan, with "Automatic register" on: hand-added folders join the lists (2026-11-16). */
function useAutoRegister(model: BuilderModel, actions: BuilderActions): void {
  const on = model.autoRegister, scannedAssets = model.discovery?.assets ?? null;
  useEffect(() => { if (on && scannedAssets !== null) actions.registerSheets(true); }, [on, scannedAssets, actions]);
}

export type { BuilderIconAsset, BuilderListView, SelectionRecipe, SheetConfig, SheetDocument, SheetLayout };

/** The artboard icon editor writes into this folder; a written icon redraws at once (2026-11-15). */
function useIconEditBinding(model: BuilderModel, computed: { assets: readonly BuilderIconAsset[]; repository: { invalidate(): void } | null }, patch: (value: Partial<BuilderModel>) => void): void {
  const live = useRef({ model, computed });
  live.current = { model, computed };
  useEffect(() => bindBuilderSvgEdit({
    root: () => live.current.model.root,
    written: (svgPath, markup) => {
      const id = live.current.computed.assets.find((a) => a.svgPath === svgPath)?.id;
      live.current.computed.repository?.invalidate();
      if (id !== undefined) patch({ svgTexts: { ...live.current.model.svgTexts, [id]: markup } });
    },
  }), [patch]);
}

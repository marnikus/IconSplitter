// useSvgBuilder.ts — the only hook the builder panel calls. It composes the
// boot, persistence, computed projection and action slices into one API.
import { useCallback, useReducer } from "react";
import { useAppSlice } from "../state/useAppState";
import { useOptionalHistory } from "../state/HistoryProvider";
import type { BuilderIconAsset, BuilderListView, SelectionRecipe, SheetConfig, SheetDocument, SheetLayout } from "../lib/svgBuilder/types";
import { builderReducer, initialBuilderModel, type BuilderModel } from "./model";
import { useBuilderBoot } from "./useBuilderBoot";
import { useBuilderPersistence } from "./useBuilderPersistence";
import { useBuilderComputed, type BuilderComputed } from "./useBuilderComputed";
import { useBuilderActions } from "./useBuilderActions";
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
  const slice = useAppSlice("builder");
  const hist = useOptionalHistory();
  const boot = useBuilderBoot(patch, model.supported);
  useBuilderPersistence(model, patch);
  const computed = useBuilderComputed(model, slice.checked, patch);
  const actions = useBuilderActions({ model, computed, boot, slice, hist, patch });
  return {
    ...model, ...computed,
    checked: slice.checked, activeId: slice.activeId, anchorId: slice.anchorId, actions,
  };
}

export type { BuilderIconAsset, BuilderListView, SelectionRecipe, SheetConfig, SheetDocument, SheetLayout };

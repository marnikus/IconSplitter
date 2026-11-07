// useBuilderActions.ts — binds stable action slices to the latest model,
// computed projection and global selection/history APIs.
import { useCallback, useMemo, useRef } from "react";
import type { RowSelection } from "../lib/reviewselect";
import { selectionPayloads } from "../lib/selectiondelta";
import type { SessionBuilder } from "../lib/session";
import type { HistoryActions } from "../state/HistoryProvider";
import { getAppState, patchBuilder } from "../state/appstore";
import { usePresetActions, type PresetEvent } from "../ui/presetops";
import { builderPresets } from "./promptstore";
import { createBuilderActions } from "./actions";
import type { BuilderActionContext, BuilderActions } from "./actiontypes";
import type { BuilderBoot } from "./useBuilderBoot";
import type { BuilderComputed } from "./useBuilderComputed";
import type { BuilderModel } from "./model";

interface Args {
  model: BuilderModel;
  computed: BuilderComputed;
  boot: BuilderBoot;
  slice: SessionBuilder;
  hist: HistoryActions | null;
  patch: (value: Partial<BuilderModel>) => void;
}

export function useBuilderActions(args: Args): BuilderActions {
  const { model, computed, boot, slice, hist, patch } = args;
  const presetModel = useMemo(() => ({ prompt: model.prompt, presets: model.presets, presetPick: model.presetPick }),
    [model.prompt, model.presets, model.presetPick]);
  const presetIo = useMemo(() => ({
    store: builderPresets,
    dispatch: (event: PresetEvent) => presetPatch(event, patch),
    say: boot.say,
  }), [patch, boot.say]);
  const presetActions = usePresetActions(presetModel, presetIo);
  const setChecked = useCallback((next: RowSelection, label: string) => {
    const before: RowSelection = {
      checked: getAppState().builder.checked, anchor: getAppState().builder.anchorId, active: getAppState().builder.activeId,
    };
    const payloads = selectionPayloads(before, next);
    hist?.push({ type: "builderChecked", label, origin: "svgBuilder", ids: payloads.ids,
      before: payloads.before, after: payloads.after });
    patchBuilder({ checked: next.checked, anchorId: next.anchor, activeId: next.active });
  }, [hist]);
  const checked: RowSelection = { checked: slice.checked, anchor: slice.anchorId, active: slice.activeId };
  const ctx: BuilderActionContext = {
    model, ...computed, placedIds: slice.checked, checked, discovery: model.discovery, scanRefs: boot.scanRefs.current,
    hist, presetActions, dispatch: patch, setChecked, setRoot: boot.setRoot,
    setDiscovery: boot.setDiscovery, setBusy: boot.setBusy, say: boot.say,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const actions = useMemo(() => createBuilderActions(() => ctxRef.current), []);
  return useMemo(() => ({ ...actions, presets: presetActions }), [actions, presetActions]);
}

function presetPatch(event: PresetEvent, patch: (value: Partial<BuilderModel>) => void): void {
  if (event.type === "prompt") patch({ prompt: event.prompt });
  else if (event.type === "presets") patch({ presets: event.presets });
  else patch({ presetPick: event.name });
}

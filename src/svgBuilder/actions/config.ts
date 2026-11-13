// actions/config.ts — layout config, presets, reset and view prefs. Config
// edits join ONE global undo timeline (sliders coalesce into one gesture);
// any manual edit marks the layout "custom". Display-only prefs are not undone.
import { applyPresetConfig, DEFAULT_CONFIG, LAYOUT_PRESETS, parseSheetConfig, type LayoutPresetId } from "../../lib/svgBuilder/config";
import { DEFAULT_SHEET_PROMPT } from "../../lib/svgBuilder/metadata";
import type { SheetConfig } from "../../lib/svgBuilder/types";
import { builderUndoPatchOf } from "../../lib/svgBuilder/undo";
import { configUndoPatchOf } from "../model";
import { saveSheetConfig } from "../configstore";
import { META_HEIGHT, saveBuilderPrefs, type BuilderPrefs } from "../prefsstore";
import { saveBuilderListView } from "../listview";
import { isBuilderDefaultPrompt, saveBuilderPrompt } from "../promptstore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type ConfigActions = Pick<BuilderActions,
  "setConfig" | "applyLayoutPreset" | "resetConfig" | "setZoom" | "fitZoom" | "toggleProvider" | "toggleMeta" | "setMetaHeight" | "toggleScores" | "setScoreOpacity"
  | "setPrompt" | "resetPrompt" | "setSearch" | "undo" | "redo">;

export function configActions(get: () => BuilderActionContext): ConfigActions {
  return {
    setConfig: (config, label, gesture) => { commitConfig(get(), { config, label: label ?? "Change sheet layout", gesture }); prefs(get(), { layout: "custom" }); },
    applyLayoutPreset: (id) => applyLayoutPreset(get(), id),
    resetConfig: () => resetConfig(get()),
    setZoom: (zoom) => prefs(get(), { zoom: Math.min(2, Math.max(0.1, Math.round(zoom * 100) / 100)), fit: false }),
    fitZoom: () => prefs(get(), { fit: true }),
    toggleProvider: (providerOpen) => prefs(get(), { providerOpen }),
    toggleMeta: (metaOpen) => prefs(get(), { metaOpen }),
    toggleScores: (showScores) => prefs(get(), { showScores }),
    setScoreOpacity: (p) => prefs(get(), { scoreOpacity: Math.round(Math.min(100, Math.max(1, p))) }),
    setMetaHeight: (h) => prefs(get(), { metaHeight: h === null ? null : Math.round(Math.min(META_HEIGHT.max, Math.max(META_HEIGHT.min, h))) }),
    setPrompt: (text) => prompt(get(), text),
    resetPrompt: () => prompt(get(), DEFAULT_SHEET_PROMPT),
    setSearch: (query) => listView(get(), { query }),
    undo: () => get().hist?.undo(),
    redo: () => get().hist?.redo(),
  };
}

interface Commit { config: SheetConfig; label: string; gesture?: boolean }

/** One history entry (or one coalesced gesture) carrying the absolute before/after config. */
export function commitConfig(ctx: BuilderActionContext, c: Commit): void {
  const before = configUndoPatchOf(ctx.model);
  const after = builderUndoPatchOf({ ...before, config: parseSheetConfig(c.config) });
  if (JSON.stringify(before.config) === JSON.stringify(after.config)) return;
  const entry = { type: "builderConfig", label: c.label, origin: "svgBuilder", ids: ["config"], before, after };
  if (c.gesture) ctx.hist?.pushGesture(entry);
  else ctx.hist?.push(entry);
  ctx.dispatch({ config: after.config });
  saveSheetConfig(after.config);
}

function applyLayoutPreset(ctx: BuilderActionContext, id: LayoutPresetId): void {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id);
  if (preset === undefined) return ctx.say("Unknown layout preset", true);
  commitConfig(ctx, { config: applyPresetConfig(ctx.model.config, id), label: `${preset.label} layout` });
  prefs(ctx, { layout: id, fit: true });
  ctx.say(`${preset.label} layout applied`);
}

/** RESET: defaults + Side banner, one undo entry; the placed icons are untouched. */
function resetConfig(ctx: BuilderActionContext): void {
  commitConfig(ctx, { config: applyPresetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner } }, "editorial"), label: "Reset sheet settings" });
  prefs(ctx, { layout: "editorial", fit: true });
  ctx.say("Sheet settings reset");
}

export function prefs(ctx: BuilderActionContext, patch: Partial<BuilderPrefs>): void {
  const next = { ...ctx.model.prefs, ...patch };
  ctx.dispatch({ prefs: next });
  saveBuilderPrefs(next);
}

function listView(ctx: BuilderActionContext, patch: Partial<BuilderActionContext["model"]["listView"]>): void {
  const next = { ...ctx.model.listView, ...patch };
  ctx.dispatch({ listView: next });
  saveBuilderListView(next);
}

function prompt(ctx: BuilderActionContext, text: string): void {
  ctx.dispatch({ prompt: text, preview: null });
  saveBuilderPrompt(text);
  if (!isBuilderDefaultPrompt(text)) ctx.say("Sheet metadata prompt saved locally");
}

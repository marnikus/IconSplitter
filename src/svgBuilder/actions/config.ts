// actions/config.ts — layout, recipe, view prefs and prompt edits. Config
// changes join ONE global undo timeline; display-only prefs do not.
import { parseSheetConfig, PRESETS } from "../../lib/svgBuilder/config";
import { DEFAULT_SELECTION_RECIPE, parseSelectionRecipe, selectAssets } from "../../lib/svgBuilder/selection";
import { DEFAULT_SHEET_PROMPT } from "../../lib/svgBuilder/metadata";
import type { SelectionRecipe, SheetConfig } from "../../lib/svgBuilder/types";
import { configUndoPatchOf } from "../model";
import { builderUndoPatchOf } from "../../lib/svgBuilder/undo";
import { saveSheetConfig } from "../configstore";
import { saveBuilderPrefs } from "../prefsstore";
import { saveBuilderListView } from "../listview";
import { isBuilderDefaultPrompt, saveBuilderPrompt } from "../promptstore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type ConfigActions = Pick<BuilderActions,
  "setConfig" | "applyLayoutPreset" | "setRecipe" | "setSeed" | "shuffle" | "setZoom"
  | "toggleProvider" | "toggleInspector" | "setPrompt" | "resetPrompt" | "setSearch" | "setCategory">;

interface ConfigPatch {
  config?: SheetConfig; recipe?: SelectionRecipe; seed?: number; lockedIds?: readonly string[];
}

export function configActions(get: () => BuilderActionContext): ConfigActions {
  return {
    setConfig: (config) => patchConfig(get(), { config }, "Change sheet layout"),
    applyLayoutPreset: (id) => applyLayoutPreset(get(), id),
    setRecipe: (recipe) => applyRecipe(get(), recipe),
    setSeed: (seed) => applyRecipe(get(), { ...get().model.recipe, seed }),
    shuffle: () => applyRecipe(get(), { ...get().model.recipe, seed: get().model.seed + 1 }),
    setZoom: (zoom) => prefs(get(), { zoom }),
    toggleProvider: (providerOpen) => prefs(get(), { providerOpen }),
    toggleInspector: (inspectorOpen) => prefs(get(), { inspectorOpen }),
    setPrompt: (text) => prompt(get(), text),
    resetPrompt: () => prompt(get(), DEFAULT_SHEET_PROMPT),
    setSearch: (query) => listView(get(), { query }),
    setCategory: (category) => listView(get(), { category }),
  };
}

function patchConfig(ctx: BuilderActionContext, patch: ConfigPatch, label: string): void {
  const before = configUndoPatchOf(ctx.model);
  const after = builderUndoPatchOf({ ...before, ...patch, config: parseSheetConfig(patch.config ?? ctx.model.config) });
  ctx.hist?.push({ type: "builderConfig", label, origin: "svgBuilder", ids: ["config"], before, after });
  ctx.dispatch({ config: after.config, recipe: after.recipe, seed: after.seed, lockedIds: after.lockedIds });
  saveSheetConfig(after.config);
}

function applyLayoutPreset(ctx: BuilderActionContext, id: string): void {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset === undefined) return ctx.say("Unknown sheet preset", true);
  patchConfig(ctx, { config: preset.config }, `Apply ${preset.label} layout`);
  ctx.say(`${preset.label} layout applied`);
}

function applyRecipe(ctx: BuilderActionContext, raw: SelectionRecipe): void {
  const recipe = parseSelectionRecipe({ ...DEFAULT_SELECTION_RECIPE, ...raw, count: Math.min(raw.count, ctx.layout.capacity) });
  patchConfig(ctx, { recipe, seed: recipe.seed }, "Change selection recipe");
  const chosen = selectAssets(ctx.assets, { ...recipe, lockedIds: [...ctx.model.lockedIds] });
  ctx.setChecked({ checked: chosen.ids, anchor: null, active: chosen.ids[0] ?? null }, "Apply selection recipe");
  for (const notice of chosen.notices) ctx.say(notice, chosen.notices.length > 0);
  if (chosen.notices.length === 0) ctx.say(`${chosen.ids.length} approved asset(s) placed`);
}

function prefs(ctx: BuilderActionContext, patch: Partial<BuilderActionContext["model"]["prefs"]>): void {
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

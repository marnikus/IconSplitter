// actions/presetjson.ts — the editable preset JSON (2026-11-13): show the sheet
// as JSON, apply pasted / loaded JSON (merged onto the sheet, icons by name),
// copy it, copy it with a parameter guide and the icon names for an AI, and
// download it. Export ▾ Save preset / Load preset use the same document.
import { sheetCopy } from "../../lib/svgBuilder/compose";
import { presetBriefForAi, presetJsonOf, readPresetJson, type AppliedPreset } from "../../lib/svgBuilder/presetjson";
import { emptySlotFor, placedOnly } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { downloadJsonText } from "../exporter";
import type { BuilderModel } from "../model";
import { commitConfig, prefs } from "./config";

type PresetJsonActions = Pick<BuilderActions,
  "openPresetJson" | "presetJsonText" | "applyPresetJson" | "copyPresetJson" | "copyPresetForAi" | "downloadPresetJson" | "savePreset" | "loadPreset">;

export function presetJsonActions(get: () => BuilderActionContext): PresetJsonActions {
  return {
    openPresetJson: () => get().dispatch({ dialog: "preset" }),
    presetJsonText: () => JSON.stringify(currentJson(get()), null, 2),
    applyPresetJson: (text) => applyPresetJson(get(), text),
    copyPresetJson: (text) => { void copy(get(), text, "Preset JSON copied"); },
    copyPresetForAi: () => { const c = get(); void copy(c, presetBriefForAi(currentJson(c), c.assets), "Preset guide + icon names copied — paste it to your AI"); },
    downloadPresetJson: (text) => { downloadJsonText(text, titleOf(get())); get().say("Preset JSON downloaded"); },
    savePreset: () => { const c = get(); downloadJsonText(JSON.stringify(currentJson(c), null, 2), titleOf(c)); c.say("Preset saved: settings, text, placement and icons by name"); },
    loadPreset: (text) => { applyPresetJson(get(), text); },
  };
}

function titleOf(ctx: BuilderActionContext): string {
  return sheetCopy(ctx.model.metadata, ctx.model.config.banner).title;
}

function currentJson(ctx: BuilderActionContext): Record<string, unknown> {
  const m = ctx.model;
  return presetJsonOf({
    name: titleOf(ctx), config: m.config, placedIds: ctx.placedIds, lockedIds: m.lockedIds,
    seed: m.seed, recipe: m.recipe, metadata: m.metadata, assets: ctx.assets,
  });
}

async function copy(ctx: BuilderActionContext, text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ctx.say(done);
  } catch {
    ctx.say("The clipboard refused the text — select it in the box and copy it by hand", true);
  }
}

/** Applies the JSON: the look (one undo entry), then the icons (one more); true when it was read. */
function applyPresetJson(ctx: BuilderActionContext, text: string): boolean {
  const read = readPresetJson(text, ctx.model.config, ctx.assets);
  if (!read.ok) { ctx.say(`Preset JSON: ${read.error}`, true); return false; }
  const p = read.preset;
  commitConfig(ctx, { config: p.config, label: "Apply preset JSON" });
  prefs(ctx, { layout: "custom", fit: true });
  ctx.dispatch(workingStateOf(p));
  if (p.placedIds !== null) placeIcons(ctx, p);
  ctx.say(reportOf(ctx, p), p.unresolved.length > 0);
  return true;
}

function workingStateOf(p: AppliedPreset): Partial<BuilderModel> {
  return {
    ...(p.seed !== null ? { seed: p.seed } : {}), ...(p.recipe !== null ? { recipe: p.recipe } : {}),
    ...(p.lockedIds !== null ? { lockedIds: p.lockedIds } : {}), ...(p.metadata !== undefined ? { metadata: p.metadata } : {}),
  };
}

/** Exactly the icons the JSON names, in its cell order; cells it does not fill stay empty. */
function placeIcons(ctx: BuilderActionContext, p: AppliedPreset): void {
  const capacity = p.config.grid.columns * p.config.grid.rows;
  const ids = (p.placedIds ?? []).slice(0, capacity);
  while (ids.length < capacity) ids.push(emptySlotFor(ids));
  ctx.setChecked({ checked: ids, anchor: null, active: placedOnly(ids)[0] ?? null }, "Apply preset JSON");
}

function reportOf(ctx: BuilderActionContext, p: AppliedPreset): string {
  if (p.unresolved.length === 0) return p.placedIds === null ? "Preset JSON applied — the icons stay as they were" : "Preset JSON applied";
  const none = ctx.assets.length === 0 ? " — open the icon folder first" : "";
  const shown = p.unresolved.slice(0, 5).join(", ");
  return `Preset JSON applied — ${p.unresolved.length} icon(s) not found and left empty: ${shown}${p.unresolved.length > 5 ? "…" : ""}${none}`;
}

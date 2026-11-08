// actions/export.ts — the "Export sheet" menu: verified, atomic SVG / PNG 2× /
// clipboard / preset delivery, and Load preset (undoable, prunes stale ids).
import { sheetCopy } from "../../lib/svgBuilder/compose";
import { parseSheetPreset, serializeSheetPreset } from "../../lib/svgBuilder/preset";
import type { SheetPreset } from "../../lib/svgBuilder/types";
import { placedOnly } from "../../lib/svgBuilder/slots";
import { copySheetSvg, downloadSheetPng, downloadSheetPreset, downloadSheetSvg, verifySheetDocument } from "../exporter";
import { commitConfig, prefs } from "./config";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type ExportActions = Pick<BuilderActions, "exportSvg" | "exportPng" | "copySvg" | "savePreset" | "loadPreset" | "presetOfModel">;
type Kind = "svg" | "png" | "copy";

export function exportActions(get: () => BuilderActionContext): ExportActions {
  return {
    exportSvg: () => { void deliver(get(), "svg"); },
    exportPng: () => { void deliver(get(), "png"); },
    copySvg: () => { void deliver(get(), "copy"); },
    savePreset: () => savePreset(get()),
    loadPreset: (text) => loadPreset(get(), text),
    presetOfModel: () => presetOfModel(get()),
  };
}

function titleOf(ctx: BuilderActionContext): string {
  return sheetCopy(ctx.model.metadata, ctx.model.config.banner).title;
}

async function deliver(ctx: BuilderActionContext, kind: Kind): Promise<void> {
  const doc = ctx.document;
  if (doc === null) return ctx.say("No composed sheet to export yet", true);
  const verified = verifySheetDocument(doc, ctx.assets);
  if (!verified.ok) return ctx.say(`Export could not be completed — ${verified.errors.join("; ")}`, true);
  ctx.setBusy("Preparing…");
  try {
    if (kind === "svg") downloadSheetSvg(doc, titleOf(ctx));
    else if (kind === "png") await downloadSheetPng(doc, titleOf(ctx));
    else await copySheetSvg(doc);
    ctx.say(DONE[kind]);
  } catch {
    ctx.say(kind === "copy" ? "Clipboard refused the SVG — use Editable SVG instead" : "Export could not be completed. Try again.", true);
  } finally {
    ctx.setBusy(null);
  }
}

const DONE: Record<Kind, string> = {
  svg: "Editable SVG exported — strokes and text preserved.",
  png: "PNG exported at 2× resolution.",
  copy: "SVG markup copied to clipboard.",
};

function presetOfModel(ctx: BuilderActionContext): SheetPreset {
  const m = ctx.model;
  return serializeSheetPreset({
    v: 1, config: m.config, placedIds: placedOnly(ctx.placedIds), lockedIds: m.lockedIds, seed: m.seed, recipe: m.recipe, metadata: m.metadata,
    sources: ctx.assets.filter((a) => ctx.placedIds.includes(a.id)).map((a) => ({ id: a.id, fingerprint: a.fingerprint })),
  });
}

function savePreset(ctx: BuilderActionContext): void {
  downloadSheetPreset(presetOfModel(ctx), titleOf(ctx));
  ctx.say("Preset saved with layout settings and seed.");
}

function loadPreset(ctx: BuilderActionContext, text: string): void {
  const { preset, droppedIds } = parseSheetPreset(text, new Set(ctx.assets.map((a) => a.id)));
  commitConfig(ctx, { config: preset.config, label: "Load builder preset" });
  prefs(ctx, { layout: "custom", fit: true });
  ctx.dispatch({ recipe: preset.recipe, seed: preset.seed, lockedIds: preset.lockedIds, metadata: preset.metadata });
  ctx.setChecked({ checked: [...preset.placedIds].slice(0, preset.config.grid.columns * preset.config.grid.rows), anchor: null,
    active: preset.placedIds[0] ?? null }, "Load builder preset");
  ctx.say(droppedIds.length > 0 ? `Preset loaded — ${droppedIds.length} icon(s) are no longer approved and were skipped` : "Builder preset loaded");
}

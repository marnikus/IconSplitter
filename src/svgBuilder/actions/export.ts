// actions/export.ts — verified, atomic SVG/PNG/preset delivery. A bad document
// never opens a download, and loading a preset prunes stale approved ids.
import { parseSheetPreset, serializeSheetPreset } from "../../lib/svgBuilder/preset";
import type { SheetPreset } from "../../lib/svgBuilder/types";
import {
  copySheetSvg, downloadSheetPng, downloadSheetPreset, downloadSheetSvg, verifySheetDocument,
} from "../exporter";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type ExportActions = Pick<BuilderActions,
  "exportSvg" | "exportPng" | "copySvg" | "savePreset" | "loadPreset" | "presetOfModel">;

export function exportActions(get: () => BuilderActionContext): ExportActions {
  return {
    exportSvg: () => deliver(get(), "svg"),
    exportPng: () => { void deliver(get(), "png"); },
    copySvg: () => { void deliver(get(), "copy"); },
    savePreset: () => savePreset(get()),
    loadPreset: (text) => loadPreset(get(), text),
    presetOfModel: () => presetOfModel(get()),
  };
}

function deliver(ctx: BuilderActionContext, kind: "svg" | "png" | "copy"): void | Promise<void> {
  const doc = ctx.document;
  if (doc === null) return ctx.say("No composed sheet to export yet", true);
  const verified = verifySheetDocument(doc, ctx.assets);
  if (!verified.ok) return ctx.say(`Export refused — ${verified.errors.join("; ")}`, true);
  if (kind === "svg") { downloadSheetSvg(doc); return ctx.say("Editable SVG downloaded"); }
  if (kind === "copy") return copyDeliver(ctx);
  return pngDeliver(ctx);
}

async function copyDeliver(ctx: BuilderActionContext): Promise<void> {
  try {
    await copySheetSvg(ctx.document!);
    ctx.say("Editable SVG copied to the clipboard");
  } catch {
    ctx.say("Clipboard refused the SVG — use Download SVG instead", true);
  }
}

async function pngDeliver(ctx: BuilderActionContext): Promise<void> {
  ctx.setBusy("Rendering PNG…");
  try {
    await downloadSheetPng(ctx.document!);
    ctx.say("PNG downloaded at 2×");
  } catch (error) {
    ctx.say(`PNG export failed — ${error instanceof Error ? error.message : "unknown error"}`, true);
  } finally {
    ctx.setBusy(null);
  }
}

function presetOfModel(ctx: BuilderActionContext): SheetPreset {
  const m = ctx.model;
  return serializeSheetPreset({
    v: 1, config: m.config, placedIds: ctx.placedIds, lockedIds: m.lockedIds,
    seed: m.seed, recipe: m.recipe, metadata: m.metadata,
    sources: ctx.assets.filter((a) => ctx.placedIds.includes(a.id))
      .map((a) => ({ id: a.id, fingerprint: a.fingerprint })),
  });
}

function savePreset(ctx: BuilderActionContext): void {
  downloadSheetPreset(presetOfModel(ctx));
  ctx.say("Builder preset downloaded");
}

function loadPreset(ctx: BuilderActionContext, text: string): void {
  const known = new Set(ctx.assets.map((a) => a.id));
  const { preset, droppedIds } = parseSheetPreset(text, known);
  ctx.dispatch({ config: preset.config, recipe: preset.recipe, seed: preset.seed,
    lockedIds: preset.lockedIds, metadata: preset.metadata });
  ctx.setChecked({ checked: [...preset.placedIds], anchor: null, active: preset.placedIds[0] ?? null }, "Load builder preset");
  ctx.say(droppedIds.length > 0
    ? `Preset loaded — ${droppedIds.length} id(s) are no longer approved and were skipped`
    : "Builder preset loaded");
}

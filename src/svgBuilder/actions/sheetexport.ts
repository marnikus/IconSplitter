// actions/sheetexport.ts — "Export all selected" (2026-11-14): every checked
// artboard (else the open one) is composed from its SAVED state and written as
// a stock package into the scanned root under `_artboard_sheets/…/export`
// (sheetfolders.ts, sheetpackage.ts, sheetwriter.ts). Its folder is remembered
// on the artboard; its icons' use is counted once (like the Export menu); every
// failure is reported, the rest still ships. Also: the metadata files written
// when an artboard's metadata is generated.
import { artboardConfig, artboardIcons, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { composeSheet } from "../../lib/svgBuilder/compose";
import { computeLayout } from "../../lib/svgBuilder/layout";
import { artboardFolder, sheetStem } from "../../lib/svgBuilder/sheetfolders";
import { converterOf } from "../../lib/upload/epsconv/registry";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { loadBridgeConfig } from "../../upload/configstore";
import { loadUploadSettings } from "../../upload/settingsstore";
import { buildSheetPackage } from "../sheetpackage";
import { writeSheetExport, writeSheetMetadata, type SheetMetaFile } from "../sheetwriter";
import { recordUse } from "../usagestore";
import { writeTemplateFolder } from "./templatefolder";
import { svgTextsFor } from "./artboardmeta";

export function sheetExportActions(get: () => BuilderActionContext): Pick<BuilderActions, "exportSelectedArtboards"> {
  return { exportSelectedArtboards: () => { void exportSelected(get); } };
}

/** The checked artboards, else the open one. */
function targetsOf(ctx: BuilderActionContext): FinalArtboard[] {
  const ids = ctx.model.artboardSel.checked.length > 0 ? ctx.model.artboardSel.checked : [ctx.model.editingArtboardId ?? ""];
  return ctx.model.artboards.filter((a) => ids.includes(a.id));
}

/** Its folder, inside its template's folder (made with template.json first when missing, 2026-11-16); kept once known. */
async function folderFor(get: () => BuilderActionContext, artboard: FinalArtboard, now: Date): Promise<string | null> {
  const template = get().model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return null;
  const templateDir = template.folder ?? await writeTemplateFolder(get, template);
  return artboardFolder({ artboard, artboards: get().model.artboards, template: { ...template, folder: templateDir ?? template.folder ?? null }, now });
}

/** Remembers the folder (and, after an export, when and which icons were counted). */
function remember(ctx: BuilderActionContext, id: string, patch: Partial<FinalArtboard>): void {
  const artboards = ctx.model.artboards.map((a) => (a.id === id ? { ...a, ...patch } : a));
  ctx.dispatch({ artboards });
  saveArtboards(artboards);
}

const epsOf = (converter: Parameters<typeof converterOf>[0]) => (input: Parameters<ReturnType<typeof converterOf>["convert"]>[0]) =>
  converterOf(converter).convert(input, { bridgeUrl: loadBridgeConfig().url, fetch: (url, init) => globalThis.fetch(url, init) });

async function exportOne(get: () => BuilderActionContext, artboard: FinalArtboard, texts: Record<string, string>): Promise<string[]> {
  const ctx = get();
  const root = ctx.model.root;
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (root === null || template === undefined) return [`${artboard.name}: its template or the folder is gone`];
  const now = new Date();
  const folder = await folderFor(get, artboard, now);
  if (folder === null) return [`${artboard.name}: its template is gone`];
  const config = artboardConfig(template, artboard);
  const doc = composeSheet({ config, layout: computeLayout(config), assets: ctx.assets, placedIds: artboard.placedIds, svgTexts: texts, metadata: artboard.metadata });
  const settings = loadUploadSettings().defaults;
  const pkg = await buildSheetPackage({ svg: doc.svg, metadata: artboard.metadata, settings, folder, stem: sheetStem(folder), pairId: artboard.id,
    now: now.toISOString(), prompt: ctx.model.prompt, model: ctx.model.gemini.model }, { eps: epsOf(settings.epsConverter) });
  await writeSheetExport(root, folder, pkg.files);
  await countUse(get, artboard, now.toISOString());
  remember(get(), artboard.id, { folder, exportedAt: now.toISOString() });
  return pkg.problems.map((p) => `${artboard.name}: ${p}`);
}

/** Its icons' use, once per artboard (the Export menu's rule, `countedIds`). */
async function countUse(get: () => BuilderActionContext, artboard: FinalArtboard, at: string): Promise<void> {
  const ctx = get();
  const fresh = [...new Set(artboardIcons(artboard))].filter((id) => !artboard.countedIds.includes(id));
  if (ctx.model.root === null || ctx.model.discovery === null || fresh.length === 0) return;
  const { records } = await recordUse({ root: ctx.model.root, assets: ctx.assets, ids: fresh, artboard: `${artboard.id} ${artboard.name}`, at });
  const discovery = get().model.discovery;
  if (discovery !== null) get().dispatch({ discovery: { ...discovery, usage: new Map([...discovery.usage, ...records]) } });
  remember(get(), artboard.id, { countedIds: [...artboard.countedIds, ...fresh] });
}

async function exportSelected(get: () => BuilderActionContext): Promise<void> {
  const ctx = get();
  if (ctx.model.root === null) return ctx.say("Open the folder first — sheets are saved inside it", true);
  const targets = targetsOf(ctx);
  if (targets.length === 0) return ctx.say("Check the artboards to export first", true);
  ctx.setBusy(`Exporting ${targets.length} artboard(s) into _artboard_sheets…`);
  const problems: string[] = [];
  try {
    const texts = await svgTextsFor(ctx, targets);
    for (const a of targets) {
      try { problems.push(...await exportOne(get, get().model.artboards.find((x) => x.id === a.id) ?? a, texts)); } catch (error) {
        problems.push(`${a.name}: ${error instanceof Error ? error.message : "could not be written"}`);
      }
    }
  } finally {
    get().setBusy(null);
  }
  get().say(problems.length === 0 ? `${targets.length} artboard(s) exported into _artboard_sheets` : `Exported with problems — ${problems.join("; ")}`, problems.length > 0);
}

/** After an artboard's metadata is generated: metadata.json + preview.png in its folder (the folder is created). */
export async function saveSheetMetadataFiles(get: () => BuilderActionContext, id: string, file: Omit<SheetMetaFile, "at">): Promise<string | null> {
  const ctx = get();
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (ctx.model.root === null || artboard === undefined) return null;
  const now = new Date();
  const folder = await folderFor(get, artboard, now);
  if (folder === null) return `${artboard.name}: its template is gone`;
  try {
    await writeSheetMetadata(ctx.model.root, folder, { ...file, at: now.toISOString() });
    remember(get(), id, { folder });
    return null;
  } catch (error) {
    return `${artboard.name}: metadata files not written (${error instanceof Error ? error.message : "write failed"})`;
  }
}

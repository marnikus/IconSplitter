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
import { loadBuilderFormats } from "../formatstore";
import { warmTextFonts } from "../../lib/upload/textoutline";
import { buildSheetPackage } from "../sheetpackage";
import { writeArtboardSeed, writeSheetExport, writeSheetMetadata, type SheetMetaFile } from "../sheetwriter";
import { recordUse } from "../usagestore";
import { writeTemplateFolder } from "./templatefolder";
import { probePath } from "../../lib/fs";
import { sheetsRoot } from "./sheetsroot";
import { writeSheetJson } from "./sheetjson";
import { svgTextsFor } from "./artboardmeta";

export function sheetExportActions(get: () => BuilderActionContext): Pick<BuilderActions, "exportSelectedArtboards" | "syncSheetJson"> {
  return { exportSelectedArtboards: () => { void exportSelected(get); }, syncSheetJson: () => { void writeSheetJson(get); } };
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
  const root = sheetsRoot(ctx, true);
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (root === null || template === undefined) return [`${artboard.name}: its template or the folder is gone`];
  const now = new Date();
  const folder = await folderFor(get, artboard, now);
  if (folder === null) return [`${artboard.name}: its template is gone`];
  const config = artboardConfig(template, artboard);
  const doc = composeSheet({ config, layout: computeLayout(config), assets: ctx.assets, placedIds: artboard.placedIds, svgTexts: texts, metadata: artboard.metadata });
  const settings = { ...loadUploadSettings().defaults, ...loadBuilderFormats() };
  if (settings.expandText) await warmTextFonts(doc.svg); // the outliner is sync; fonts load here
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
  if (sheetsRoot(ctx) === null) return;
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

/** The store catches up with a just-added artboard (a few ticks at most). */
async function arrived(get: () => BuilderActionContext, id: string): Promise<FinalArtboard | undefined> {
  for (let i = 0; i < 20 && !get().model.artboards.some((a) => a.id === id); i += 1) await new Promise((r) => setTimeout(r, 0));
  return get().model.artboards.find((a) => a.id === id);
}

/** metadata.json before any metadata exists: the artboard's title, empty fields. */
function seedJson(artboard: FinalArtboard, at: string): Record<string, unknown> {
  const m = artboard.metadata;
  return { v: 1, at, state: m?.state ?? "empty", title: m?.title ?? "", description: m?.description ?? "", tags: m?.tags ?? [],
    artboardTitle: artboard.title, prompt: "", model: "" };
}

/** "+ Artboard" (2026-11-16): its folder appears in Explorer at once, with a metadata.json to fill later. */
export async function seedArtboardFolder(get: () => BuilderActionContext, id: string): Promise<string | null> {
  const artboard = await arrived(get, id);
  const root = sheetsRoot(get());
  if (root === null || artboard === undefined) return null;
  const now = new Date();
  const folder = await folderFor(get, artboard, now);
  if (folder === null) return null;
  try {
    await writeArtboardSeed(root, folder, seedJson(artboard, now.toISOString()));
    remember(get(), id, { folder });
    if (get().model.editingArtboardId === id) await writeSheetJson(get, folder);
    return folder;
  } catch (error) {
    get().say(`Artboard folder not written — ${error instanceof Error ? error.message : "write failed"}`, true);
    return null;
  }
}

/** Removing artboards (2026-11-16) deletes their own folders under _artboard_sheets too; failures are reported. */
export async function dropArtboardFolders(get: () => BuilderActionContext, gone: readonly FinalArtboard[]): Promise<void> {
  const root = sheetsRoot(get(), true);
  if (root === null) return;
  const failed: string[] = [];
  for (const a of gone) {
    if (a.folder === null || !a.folder.startsWith("_artboard_sheets/")) continue;
    const cut = a.folder.lastIndexOf("/");
    try {
      const parent = await probePath(root, a.folder.slice(0, cut));
      if (parent?.removeEntry !== undefined) await parent.removeEntry(a.folder.slice(cut + 1), { recursive: true });
    } catch { failed.push(a.name); }
  }
  if (failed.length > 0) get().say(`Folder not deleted for ${failed.join(", ")} — remove it in Explorer`, true);
}

/** After an artboard's metadata is generated: metadata.json + preview.png in its folder (the folder is created). */
export async function saveSheetMetadataFiles(get: () => BuilderActionContext, id: string, file: Omit<SheetMetaFile, "at">): Promise<string | null> {
  const ctx = get();
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  const root = sheetsRoot(ctx);
  if (root === null || artboard === undefined) return null;
  const now = new Date();
  const folder = await folderFor(get, artboard, now);
  if (folder === null) return `${artboard.name}: its template is gone`;
  try {
    await writeSheetMetadata(root, folder, { ...file, at: now.toISOString() });
    remember(get(), id, { folder });
    return null;
  } catch (error) {
    return `${artboard.name}: metadata files not written (${error instanceof Error ? error.message : "write failed"})`;
  }
}

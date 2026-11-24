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
import type { UploadSettings } from "../../lib/upload/settings";
import { loadBuilderFormats } from "../formatstore";
import { warmTextFonts } from "../../lib/upload/textoutline";
import { buildSheetPackage } from "../sheetpackage";
import { prepareSheetExportDir, writeArtboardSeed, writeSheetExportPrepared, writeSheetMetadata, type PreparedExportDir, type SheetMetaFile } from "../sheetwriter";
import { createUsageBatchSession, type UsageBatchSession } from "../usagestore";
import { writeTemplateFolder } from "./templatefolder";
import { sheetsRoot } from "./sheetsroot";
import { ensureDirPath, withDirCache, type DirHandleLike } from "../../lib/fs";
import { createLimiter } from "../../lib/limiter";
import { jpegWorkersAvailable, poolSize } from "../../lib/upload/jpegworker";
import { writeSheetJson } from "./sheetjson";
import { svgTextsFor } from "./artboardmeta";
import { beginBuilderExport, type BuilderExportRun } from "../exportprogress";
import { effectiveExportStem } from "../../lib/upload/uploadname";
import { fitStemToDir } from "../../upload/renameexport";
import { getUploadName } from "../../upload/uploadnamestore";

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

/**
 * The settings the builder's package reads (2026-11-19): the SVG to upload tab's
 * visual defaults (stroke, background, artboard…) under the builder's OWN
 * format store, so the Export settings dialog shapes the package at once. One
 * owner, so the test of that wiring cannot drift from the export.
 */
export function sheetSettings(): UploadSettings {
  return { ...loadUploadSettings().defaults, ...loadBuilderFormats() };
}

export function sheetExportLanes(settings: UploadSettings): number {
  return settings.epsConverter === "inkscape" || !jpegWorkersAvailable() ? 1 : poolSize();
}

const epsOf = (converter: Parameters<typeof converterOf>[0], signal?: AbortSignal) => (input: Parameters<ReturnType<typeof converterOf>["convert"]>[0]) =>
  converterOf(converter).convert(input, { bridgeUrl: loadBridgeConfig().url, fetch: (url, init) => globalThis.fetch(url, init) }, signal);

interface CompletedExport { id: string; name: string; folder: string; at: string; freshIds: string[]; problems: string[] }
interface PrecomposedItem { folder: string; svg: string; at: string; preparedDirTask: Promise<PreparedExportDir> }
interface BatchEnv {
  get: () => BuilderActionContext; root: DirHandleLike; settings: UploadSettings;
  texts: Record<string, string>; run: BuilderExportRun; precomposed: Map<string, Promise<PrecomposedItem | null>>;
}

async function ensureTemplateFolders(get: () => BuilderActionContext, targets: readonly FinalArtboard[]): Promise<void> {
  const seen = new Set<string>();
  for (const a of targets) {
    if (seen.has(a.templateId)) continue;
    seen.add(a.templateId);
    const t = get().model.templates.find((x) => x.id === a.templateId);
    if (t !== undefined && t.folder == null) await writeTemplateFolder(get, t);
  }
}

async function resolveExportStem(root: DirHandleLike, folder: string, artboard: FinalArtboard): Promise<{ workName: string; exportStem: string }> {
  const workName = sheetStem(folder);
  const desiredStem = effectiveExportStem(workName, artboard.uploadName ?? getUploadName(artboard.id));
  if (desiredStem === workName) return { workName, exportStem: workName };
  const exportStem = await fitStemToDir(await ensureDirPath(root, `${folder}/export`), desiredStem, workName);
  return { workName, exportStem };
}

async function buildPrecomposed(env: BatchEnv, artboard: FinalArtboard): Promise<PrecomposedItem | null> {
  const ctx = env.get();
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return null;
  const now = new Date();
  const folder = await folderFor(env.get, artboard, now);
  if (folder === null) return null;
  const preparedDirTask = prepareSheetExportDir(env.root, folder);
  preparedDirTask.catch(() => undefined);
  const config = artboardConfig(template, artboard);
  const doc = composeSheet({ config, layout: computeLayout(config), assets: ctx.assets, placedIds: artboard.placedIds, svgTexts: env.texts, metadata: artboard.metadata });
  return { folder, svg: doc.svg, at: now.toISOString(), preparedDirTask };
}

function getOrStartPrecompose(env: BatchEnv, artboard: FinalArtboard): Promise<PrecomposedItem | null> {
  const existing = env.precomposed.get(artboard.id);
  if (existing !== undefined) return existing;
  const task = buildPrecomposed(env, artboard);
  env.precomposed.set(artboard.id, task);
  return task;
}

function freshIdsOf(artboard: FinalArtboard): string[] {
  return [...new Set(artboardIcons(artboard))].filter((id) => !artboard.countedIds.includes(id));
}

function buildLastIconTargets(targets: readonly FinalArtboard[]): Map<string, number> {
  const last = new Map<string, number>();
  targets.forEach((t, idx) => { for (const id of freshIdsOf(t)) last.set(id, idx); });
  return last;
}

function startUsageSession(ctx: BuilderActionContext, lastByIcon: ReadonlyMap<string, number>): UsageBatchSession | null {
  const useRoot = ctx.repository?.dirRoot ?? ctx.model.root;
  if (useRoot === null || ctx.model.discovery === null || lastByIcon.size === 0) return null;
  return createUsageBatchSession(useRoot, ctx.assets, [...lastByIcon.keys()]);
}

async function exportOneInBatch(env: BatchEnv, artboard: FinalArtboard, nextTarget?: FinalArtboard): Promise<CompletedExport | string[]> {
  const pre = await getOrStartPrecompose(env, artboard);
  if (pre === null) return [`${artboard.name}: its template is gone`];
  if (env.settings.expandText) await warmTextFonts(pre.svg);
  const { workName, exportStem } = await resolveExportStem(env.root, pre.folder, artboard);
  const ctx = env.get();
  const pkg = await buildSheetPackage({ svg: pre.svg, metadata: artboard.metadata, settings: env.settings, folder: pre.folder, workName, stem: exportStem, pairId: artboard.id,
    now: pre.at, prompt: ctx.model.prompt, model: ctx.model.gemini.model }, { eps: epsOf(env.settings.epsConverter, env.run.signal) });
  if (env.run.isCancelled()) return [];
  const writeTask = writeSheetExportPrepared(await pre.preparedDirTask, pkg.files);
  if (nextTarget !== undefined && !env.run.isCancelled()) {
    const nextArtboard = env.get().model.artboards.find((x) => x.id === nextTarget.id) ?? nextTarget;
    void getOrStartPrecompose(env, nextArtboard);
  }
  await writeTask;
  return { id: artboard.id, name: artboard.name, folder: pre.folder, at: pre.at, freshIds: freshIdsOf(artboard), problems: pkg.problems.map((p) => `${artboard.name}: ${p}`) };
}

async function commitBatchState(get: () => BuilderActionContext, completed: readonly CompletedExport[], usageSession: UsageBatchSession | null): Promise<void> {
  const useOut = usageSession !== null ? await usageSession.finish() : null;
  if (completed.length === 0) return;
  const latest = get();
  const byId = new Map(completed.map((c) => [c.id, c]));
  const artboards = latest.model.artboards.map((a) => {
    const c = byId.get(a.id);
    if (c === undefined) return a;
    return { ...a, folder: c.folder, exportedAt: c.at, countedIds: c.freshIds.length === 0 ? a.countedIds : [...a.countedIds, ...c.freshIds] };
  });
  saveArtboards(artboards);
  const disc = latest.model.discovery;
  const nextDisc = disc !== null && useOut !== null && useOut.records.size > 0
    ? { ...disc, usage: new Map([...disc.usage, ...useOut.records]) }
    : undefined;
  latest.dispatch({ artboards, ...(nextDisc === undefined ? {} : { discovery: nextDisc }) });
}

function recordCompletedItem(res: CompletedExport, idx: number, lastByIcon: ReadonlyMap<string, number>, usageSession: UsageBatchSession | null): void {
  if (usageSession === null || res.freshIds.length === 0) return;
  usageSession.enqueue(res.freshIds, `${res.id} ${res.name}`, res.at);
  usageSession.flushIcons(res.freshIds.filter((id) => lastByIcon.get(id) === idx));
}

interface LoopState {
  env: BatchEnv; lanes: number; targets: readonly FinalArtboard[]; lastByIcon: ReadonlyMap<string, number>;
  usageSession: UsageBatchSession | null; completed: CompletedExport[]; problems: string[]; done: number;
}

async function runOneExportTarget(st: LoopState, target: FinalArtboard, idx: number): Promise<void> {
  const { env } = st;
  if (env.run.isCancelled()) return;
  const a = env.get().model.artboards.find((x) => x.id === target.id) ?? target;
  env.run.startItem(a.name);
  let itemProblems: string[] = [];
  try {
    const res = await exportOneInBatch(env, a, st.lanes === 1 ? st.targets[idx + 1] : undefined);
    if (Array.isArray(res)) itemProblems = res;
    else { st.completed.push(res); recordCompletedItem(res, idx, st.lastByIcon, st.usageSession); itemProblems = res.problems; }
  } catch (error) {
    if (!env.run.isCancelled()) itemProblems = [`${a.name}: ${error instanceof Error ? error.message : "could not be written"}`];
  }
  if (env.run.isCancelled()) return;
  st.done += 1;
  st.problems.push(...itemProblems);
  env.run.advance(itemProblems);
}

async function runExportLoop(get: () => BuilderActionContext, targets: readonly FinalArtboard[], run: BuilderExportRun): Promise<{ done: number; problems: string[] }> {
  const rawRoot = sheetsRoot(get(), true);
  if (rawRoot === null) return { done: 0, problems: ["Export folder is unavailable"] };
  const settings = sheetSettings();
  const lastByIcon = buildLastIconTargets(targets);
  const usageSession = startUsageSession(get(), lastByIcon);
  const [texts] = await Promise.all([svgTextsFor(get(), targets), ensureTemplateFolders(get, targets)]);
  const env: BatchEnv = { get, root: withDirCache(rawRoot), settings, texts, run, precomposed: new Map() };
  const lanes = sheetExportLanes(settings);
  const limit = createLimiter(lanes);
  const st: LoopState = { env, lanes, targets, lastByIcon, usageSession, completed: [], problems: [], done: 0 };
  try {
    await Promise.all(targets.map((target, idx) => limit(() => runOneExportTarget(st, target, idx))));
  } finally {
    await commitBatchState(get, st.completed, usageSession);
  }
  return { done: st.done, problems: st.problems };
}

async function exportSelected(get: () => BuilderActionContext): Promise<void> {
  const ctx = get();
  if (ctx.model.root === null) return ctx.say("Open the folder first — sheets are saved inside it", true);
  if (sheetsRoot(ctx) === null) return;
  const targets = targetsOf(ctx);
  if (targets.length === 0) return ctx.say("Check the artboards to export first", true);
  const run = beginBuilderExport(targets.length);
  ctx.setBusy(`Exporting artboards (0/${targets.length} · ${targets.length} left)…`);
  let done: number;
  let problems: string[];
  try {
    ({ done, problems } = await runExportLoop(get, targets, run));
  } finally {
    run.finish();
    get().setBusy(null);
  }
  if (run.isCancelled()) return get().say(`Artboard export cancelled — ${done} of ${targets.length} exported (${targets.length - done} left)`);
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

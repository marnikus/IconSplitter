// actions/sheetsync.ts — the app's newer state into its JSON files (2026-11-22).
// Every artboard's sheet.json (unless it is open: the stage writes that one) and
// metadata.json follow its SAVED state — rewritten when the artboard or its
// template's look changes — and template.json follows its template. A file
// changed outside the app is never overwritten (🗂 Register reads it); a file
// from before fingerprints that differs is copied into `.removed versions` first.
// A folder removed by hand is not made again. All file work runs one job at a
// time (`exclusive`), Register included.
import { probePath, type DirHandleLike } from "../../lib/fs";
import type { FinalArtboard } from "../../lib/svgBuilder/artboards";
import { trashStamp } from "../../lib/svgBuilder/removal";
import {
  artboardFromSheet, artboardSheetJson, fileState, metaFileJson, olderThanSave, sameArtboard, sameLook, sameMetaFile, syncDecision,
  templateLookFromFile, type SyncAction,
} from "../../lib/svgBuilder/sheetsync";
import type { SheetTemplate } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { knownSig, rememberSig } from "../filesigstore";
import { backupSheetFile, jsonText, readSheetFile, writeSheetFile, type SheetFileRead } from "../sheetfiles";
import { sheetsRoot } from "./sheetsroot";
import { blueprintOf } from "./templatefolder";

type Get = () => BuilderActionContext;
let chain: Promise<unknown> = Promise.resolve();

/** One file job at a time, in order; a failed job never blocks the next. */
export function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

export function sheetSyncActions(get: Get): Pick<BuilderActions, "syncSheetFiles"> {
  return { syncSheetFiles: (scope) => { void exclusive(() => syncSheetFilesNow(get, scope)); } };
}

/** What one file should say; whether a differing copy from before fingerprints is known to be stale; whether a missing one is written. */
interface FileSpec { path: string; same: (text: string) => boolean; next: (old: string | null) => string; legacyStale: (file: SheetFileRead) => boolean; writeMissing: boolean }

interface Tally { replaced: number }

const stampNow = () => trashStamp(new Date(), Math.random().toString(36).slice(2, 6));

function actionFor(spec: FileSpec, file: SheetFileRead | null): SyncAction {
  if (file === null) return spec.writeMissing ? "write" : "keep";
  return syncDecision(fileState(file.text, knownSig(spec.path)), spec.same(file.text), spec.legacyStale(file));
}

/** One file brought in step (`syncDecision`) — never one changed outside the app. */
async function syncFile(root: DirHandleLike, spec: FileSpec, tally: Tally): Promise<void> {
  const file = await readSheetFile(root, spec.path);
  const action = actionFor(spec, file);
  if (action === "keep") return;
  if (action === "adopt" && file !== null) return rememberSig(spec.path, file.text);
  if (action === "backup-write" && file !== null) {
    await backupSheetFile(root, spec.path, file.text, stampNow());
    tally.replaced += 1;
  }
  await writeSheetFile(root, spec.path, spec.next(file?.text ?? null));
}

/** template.json: the template's look; a differing copy from before fingerprints is stale when older than its last save. */
function templateSpec(ctx: BuilderActionContext, t: SheetTemplate, folder: string): FileSpec {
  return {
    path: `${folder}/template.json`, writeMissing: true,
    same: (text) => { const look = templateLookFromFile(t, text); return look !== null && sameLook(look, t.config); },
    next: () => jsonText(blueprintOf(ctx, t)),
    legacyStale: (file) => olderThanSave(file.modified, t.updated),
  };
}

/** sheet.json: the artboard's saved state (template look + its own); a differing copy from before fingerprints is replaced, kept aside. */
function sheetSpec(ctx: BuilderActionContext, a: FinalArtboard, t: SheetTemplate, folder: string): FileSpec {
  return {
    path: `${folder}/sheet.json`, writeMissing: true,
    same: (text) => { const read = artboardFromSheet(a, t, text, ctx.assets); return read !== null && sameArtboard(read.artboard, a, t); },
    next: () => jsonText(artboardSheetJson(a, t, { assets: ctx.assets, seed: ctx.model.seed, recipe: ctx.model.recipe })),
    legacyStale: () => true,
  };
}

/** metadata.json: the artboard's saved metadata, its record fields (when, prompt, model) kept. */
function metaSpec(a: FinalArtboard, folder: string): FileSpec {
  return { path: `${folder}/metadata.json`, writeMissing: a.metadata !== null, same: (text) => sameMetaFile(text, a.metadata),
    next: (old) => jsonText(metaFileJson(old, a.metadata)), legacyStale: () => true };
}

async function syncTemplate(ctx: BuilderActionContext, root: DirHandleLike, t: SheetTemplate, tally: Tally): Promise<void> {
  if (t.folder == null || (await probePath(root, t.folder)) === null) return;
  await syncFile(root, templateSpec(ctx, t, t.folder), tally);
}

async function syncArtboard(ctx: BuilderActionContext, root: DirHandleLike, a: FinalArtboard, tally: Tally): Promise<void> {
  const t = ctx.model.templates.find((x) => x.id === a.templateId);
  if (a.folder === null || t === undefined || (await probePath(root, a.folder)) === null) return;
  if (ctx.model.editingArtboardId !== a.id) await syncFile(root, sheetSpec(ctx, a, t, a.folder), tally);
  await syncFile(root, metaSpec(a, a.folder), tally);
}

/** Every template and artboard ("all"), or only the given artboards. */
async function syncScope(ctx: BuilderActionContext, root: DirHandleLike, scope: "all" | readonly string[], tally: Tally): Promise<void> {
  if (scope === "all") for (const t of ctx.model.templates) await syncTemplate(ctx, root, t, tally);
  for (const a of ctx.model.artboards) if (scope === "all" || scope.includes(a.id)) await syncArtboard(ctx, root, a, tally);
}

/** Every template and artboard ("all": a folder's first scan, Register) or the given artboards — needs the folder and its scan (icons by name). */
export async function syncSheetFilesNow(get: Get, scope: "all" | readonly string[]): Promise<void> {
  const ctx = get();
  const root = sheetsRoot(ctx, true);
  if (root === null || ctx.model.discovery === null) return;
  const tally: Tally = { replaced: 0 };
  try {
    await syncScope(ctx, root, scope, tally);
  } catch (error) {
    get().say(`Sheet files not brought up to date — ${error instanceof Error ? error.message : "the folder refused"}`, true);
  }
  if (tally.replaced > 0) get().say(`${tally.replaced} JSON file(s) from before this version differed from the app and were replaced — the old copies are in the .removed versions beside them`);
}

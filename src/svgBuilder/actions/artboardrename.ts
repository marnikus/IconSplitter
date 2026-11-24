// actions/artboardrename.ts — per-artboard and bulk upload file renaming for
// SVG builder Final artboards (before or after export; workName & id stay).

import { probePath, readTextAt, type DirHandleLike } from "../../lib/fs";
import { isRecord } from "../../lib/isrecord";
import type { FinalArtboard } from "../../lib/svgBuilder/artboards";
import { artboardFolder, sheetStem } from "../../lib/svgBuilder/sheetfolders";
import type { SheetTemplate } from "../../lib/svgBuilder/templates";
import { parseExportRecord } from "../../lib/upload/export";
import { buildUploadName, effectiveExportStem, sanitizeUploadName } from "../../lib/upload/uploadname";
import { renameExportPackage, type RenameExportResult } from "../../upload/renameexport";
import { announceItemRename, singleRenameMessage } from "../../upload/renamefeedback";
import {
  announceBatchRename,
  beginRenameRun,
  yieldRenameProgress,
  type RenameItemOutcome,
} from "../../upload/renameprogress";
import { getUploadName, setUploadName } from "../../upload/uploadnamestore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { bootBuilderRoot } from "../scan";
import { isSplitOutput, sheetsRoot } from "./sheetsroot";

type RenameSlice = Pick<BuilderActions, "setArtboardUploadName" | "renameArtboardsForUpload">;
interface TitleDesc { title: string; description: string }

export function artboardWorkName(
  artboard: FinalArtboard,
  artboards: readonly FinalArtboard[],
  templates: readonly SheetTemplate[],
): string {
  if (artboard.folder !== null) return sheetStem(artboard.folder);
  const template = templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return artboard.id;
  return sheetStem(artboardFolder({ artboard, artboards, template, now: new Date() }));
}

export function resolvedArtboardUploadName(artboard: FinalArtboard, workName: string): string | null {
  const raw = artboard.uploadName ?? getUploadName(artboard.id);
  if (!raw) return null;
  const clean = sanitizeUploadName(raw);
  return clean === "" || clean === workName ? null : clean;
}

function saveUploadField(ctx: BuilderActionContext, id: string, uploadName: string | null): void {
  const artboards = ctx.model.artboards.map((a) => {
    if (a.id !== id) return a;
    const copy = { ...a };
    if (uploadName === null) delete copy.uploadName;
    else copy.uploadName = uploadName;
    return copy;
  });
  ctx.dispatch({ artboards });
  saveArtboards(artboards);
}

async function resolveRoot(ctx: BuilderActionContext, silent: boolean): Promise<DirHandleLike | null> {
  const cur = sheetsRoot(ctx, silent);
  if (cur !== null) return cur;
  if (ctx.model.root !== null) return null;
  const booted = await bootBuilderRoot().catch(() => null);
  return booted !== null && !isSplitOutput(booted) ? booted : null;
}

function parseMetaJson(raw: string | null): TitleDesc | null {
  if (raw === null) return null;
  try {
    const m = JSON.parse(raw);
    if (!isRecord(m)) return null;
    const cand = { title: typeof m.title === "string" ? m.title : "", description: typeof m.description === "string" ? m.description : "" };
    return buildUploadName(cand) !== "" ? cand : null;
  } catch {
    return null;
  }
}

function parseExportMeta(raw: string | null): TitleDesc | null {
  if (raw === null) return null;
  try {
    const rec = parseExportRecord(JSON.parse(raw));
    return rec?.metadata ? { title: rec.metadata.title, description: rec.metadata.description } : null;
  } catch {
    return null;
  }
}

async function readDiskMeta(root: DirHandleLike | null, folder: string | null): Promise<TitleDesc | null> {
  if (root === null || folder === null) return null;
  const folderDir = await probePath(root, folder);
  if (folderDir === null) return null;
  const fromMeta = parseMetaJson(await readTextAt(folderDir, "metadata.json"));
  if (fromMeta !== null) return fromMeta;
  const expDir = await probePath(folderDir, "export");
  if (expDir === null) return null;
  return parseExportMeta(await readTextAt(expDir, "export.json"));
}

async function resolveGeneratedStem(ctx: BuilderActionContext, a: FinalArtboard): Promise<string> {
  const stageMeta = ctx.model.editingArtboardId === a.id ? ctx.model.metadata : null;
  const mem = a.metadata && (a.metadata.title || a.metadata.description) ? a.metadata : stageMeta;
  if (mem) {
    const built = buildUploadName({ title: mem.title, description: mem.description });
    if (built !== "") return built;
  }
  const disk = await readDiskMeta(await resolveRoot(ctx, true), a.folder);
  return disk ? buildUploadName(disk) : "";
}

function desiredArtboardStem(rawName: string | null): string | null {
  return rawName === null ? null : (sanitizeUploadName(rawName) || null);
}

async function renameArtboardOnDisk(
  root: DirHandleLike | null,
  folder: string | null,
  workName: string,
  desired: string | null,
): Promise<RenameExportResult> {
  if (root === null || folder === null) {
    return { ok: true, diskRenamed: false, uploadName: effectiveExportStem(workName, desired), record: null };
  }
  return renameExportPackage({ root, exportDir: `${folder}/export`, workName, nextUploadName: desired });
}

function classifyOutcome(diskRenamed: boolean, unchanged: boolean): RenameItemOutcome {
  if (diskRenamed) return { kind: "disk" };
  return unchanged ? { kind: "unchanged" } : { kind: "pending" };
}

async function applyOneArtboardRename(
  get: () => BuilderActionContext,
  id: string,
  rawName: string | null,
  silent = false,
): Promise<RenameItemOutcome> {
  const ctx = get();
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (!artboard) return { kind: "failed", reason: "artboard not found" };
  const workName = artboardWorkName(artboard, ctx.model.artboards, ctx.model.templates);
  const prevEffective = effectiveExportStem(workName, resolvedArtboardUploadName(artboard, workName));
  const desired = desiredArtboardStem(rawName);
  const res = await renameArtboardOnDisk(await resolveRoot(ctx, silent), artboard.folder, workName, desired);
  if (!res.ok) {
    if (!silent) announceItemRename(id, `Could not rename exported files — ${res.reason}`, get().say, true);
    return { kind: "failed", reason: res.reason };
  }
  const unchanged = !res.diskRenamed && (res.alreadyNamed === true || prevEffective === res.uploadName);
  const finalCustom = desired === null || res.uploadName === workName ? null : res.uploadName;
  const stored = setUploadName(id, finalCustom, workName);
  saveUploadField(get(), id, stored);
  if (!silent) {
    const msg = singleRenameMessage({ stored, workName, target: res.uploadName, diskRenamed: res.diskRenamed, unchanged });
    announceItemRename(id, msg, get().say);
  }
  return classifyOutcome(res.diskRenamed, unchanged);
}

async function renameSelectedArtboards(get: () => BuilderActionContext, ids: readonly string[]): Promise<void> {
  const start = get();
  const selected = start.model.artboards.filter((a) => ids.includes(a.id));
  if (selected.length === 0) return start.say("Check the artboards to rename first", true);
  const run = beginRenameRun("svgBuilder", selected.length);
  for (const a of selected) {
    if (run.isCancelled()) break;
    run.startItem(a.name || a.id);
    await yieldRenameProgress();
    if (run.isCancelled()) break;
    const gen = await resolveGeneratedStem(get(), a);
    if (gen === "") { run.record({ kind: "skipped" }); continue; }
    run.record(await applyOneArtboardRename(get, a.id, gen, true));
  }
  announceBatchRename("svgBuilder", run.finish(), get().say);
}

export function artboardRenameActions(get: () => BuilderActionContext): RenameSlice {
  return {
    setArtboardUploadName: (id, next) => { void applyOneArtboardRename(get, id, next); },
    renameArtboardsForUpload: (ids) => { void renameSelectedArtboards(get, ids); },
  };
}

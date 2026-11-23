// actions/artboardrename.ts — per-artboard and bulk upload file renaming for
// SVG builder Final artboards (before or after export; workName & id stay).

import type { FinalArtboard } from "../../lib/svgBuilder/artboards";
import { artboardFolder, sheetStem } from "../../lib/svgBuilder/sheetfolders";
import type { SheetTemplate } from "../../lib/svgBuilder/templates";
import { buildUploadName, effectiveExportStem, sanitizeUploadName } from "../../lib/upload/uploadname";
import { renameExportPackage } from "../../upload/renameexport";
import { getUploadName, setUploadName } from "../../upload/uploadnamestore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { sheetsRoot } from "./sheetsroot";

type RenameSlice = Pick<BuilderActions, "setArtboardUploadName" | "renameArtboardsForUpload">;

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

function renameDoneMessage(stored: string | null, workName: string, target: string, diskRenamed: boolean): string {
  if (diskRenamed) return stored === null ? `Exported files reset to ${workName}` : `Exported files renamed to ${target}`;
  return stored === null ? `Upload file name reset to ${workName}` : `Upload file name saved for export: ${target}`;
}

async function applyOneArtboardRename(
  get: () => BuilderActionContext,
  id: string,
  rawName: string | null,
  silent = false,
): Promise<"disk" | "pending" | "failed"> {
  const ctx = get();
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (!artboard) return "failed";
  const workName = artboardWorkName(artboard, ctx.model.artboards, ctx.model.templates);
  const stored = setUploadName(id, rawName, workName);
  saveUploadField(get(), id, stored);
  const target = effectiveExportStem(workName, stored);
  const root = sheetsRoot(get());
  const res = root !== null && artboard.folder !== null
    ? await renameExportPackage({ root, exportDir: `${artboard.folder}/export`, workName, nextUploadName: stored })
    : { ok: true as const, diskRenamed: false, uploadName: target, record: null };
  if (!res.ok) {
    if (!silent) get().say(`Could not rename exported files — ${res.reason}`, true);
    return "failed";
  }
  if (!silent) get().say(renameDoneMessage(stored, workName, target, res.diskRenamed));
  return res.diskRenamed ? "disk" : "pending";
}

async function renameSelectedArtboards(get: () => BuilderActionContext, ids: readonly string[]): Promise<void> {
  const start = get();
  const selected = start.model.artboards.filter((a) => ids.includes(a.id));
  if (selected.length === 0) return start.say("Check the artboards to rename first", true);
  let disk = 0;
  let pending = 0;
  let skipped = 0;
  for (const a of selected) {
    const gen = a.metadata ? buildUploadName({ title: a.metadata.title, description: a.metadata.description }) : "";
    if (gen === "") { skipped += 1; continue; }
    const out = await applyOneArtboardRename(get, a.id, gen, true);
    if (out === "disk") disk += 1;
    else if (out === "pending") pending += 1;
  }
  if (disk + pending === 0) return get().say("No selected artboards have Title + Description metadata to build an upload name", true);
  const parts = [`Renamed ${disk + pending} artboard(s) for upload`];
  if (pending > 0) parts.push(`${pending} ready for first export`);
  if (skipped > 0) parts.push(`${skipped} skipped (no metadata)`);
  get().say(parts.join(" · "));
}

export function artboardRenameActions(get: () => BuilderActionContext): RenameSlice {
  return {
    setArtboardUploadName: (id, next) => { void applyOneArtboardRename(get, id, next); },
    renameArtboardsForUpload: (ids) => { void renameSelectedArtboards(get, ids); },
  };
}

// actions/register.ts — "Register templates and artboards" (2026-11-16; reading
// back edited files 2026-11-22). Walks `_artboard_sheets` for template folders
// (template.json) and the artboard folders inside them (sheet.json and/or
// metadata.json); registers what is new and updates what was changed outside
// the app (lib/svgBuilder/registerplan.ts — the app's own copies, old ones or
// drafts, are never read back); then brings the app's newer state into files
// that still hold an older copy (sheetsync.ts). By the 🗂 button, or after each
// scan when "Automatic register" is on. What the stage shows follows its updated
// files unless it holds unsaved edits.
import { probePath, TRASH_DIR, type DirHandleLike } from "../../lib/fs";
import { registerPlan, type FoundArtboard, type FoundTemplate, type RegisterPlan } from "../../lib/svgBuilder/registerplan";
import { SHEETS_DIR } from "../../lib/svgBuilder/sheetfolders";
import { templateChanged } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { artboardChanged } from "../artboarddraft";
import { saveArtboards } from "../artboardstore";
import { saveAutoRegister } from "../autoregisterstore";
import { knownSig, rememberSig } from "../filesigstore";
import { readSheetFile } from "../sheetfiles";
import { saveTemplates } from "../templatestore";
import { openArtboardRow } from "./artboards";
import { exclusive, syncSheetFilesNow } from "./sheetsync";
import { sheetsRoot } from "./sheetsroot";
import { showTemplate } from "./templates";

type Get = () => BuilderActionContext;

/** Sub-folders by name — never the `.removed versions` trash, whose folders wait for an undo (2026-11-22). */
const subdirs = async (dir: DirHandleLike): Promise<Array<[string, DirHandleLike]>> => {
  const out: Array<[string, DirHandleLike]> = [];
  for await (const [name, h] of dir.entries()) if (h.kind === "directory" && name !== TRASH_DIR) out.push([name, h as DirHandleLike]);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};

const textAt = async (root: DirHandleLike, path: string) => (await readSheetFile(root, path).catch(() => null))?.text ?? null;

async function artboardsIn(root: DirHandleLike, folder: string, dir: DirHandleLike): Promise<FoundArtboard[]> {
  const out: FoundArtboard[] = [];
  for (const [name] of await subdirs(dir)) {
    const path = `${folder}/${name}`;
    const sheet = await textAt(root, `${path}/sheet.json`);
    const meta = await textAt(root, `${path}/metadata.json`);
    if (sheet !== null || meta !== null) out.push({ folder: path, sheet, meta });
  }
  return out;
}

/** Every folder holding a template.json, at any depth under _artboard_sheets (month/day/… or not). */
export async function findSheetFolders(root: DirHandleLike): Promise<FoundTemplate[]> {
  const top = await probePath(root, SHEETS_DIR).catch(() => null);
  const out: FoundTemplate[] = [];
  const walk = async (dir: DirHandleLike, path: string, depth: number): Promise<void> => {
    const json = await readSheetFile(root, `${path}/template.json`).catch(() => null);
    if (json !== null) { out.push({ folder: path, json: json.text, modified: json.modified, artboards: await artboardsIn(root, path, dir) }); return; }
    if (depth < 4) for (const [name, sub] of await subdirs(dir)) await walk(sub, `${path}/${name}`, depth + 1);
  };
  if (top !== null) await walk(top, SHEETS_DIR, 0);
  return out;
}

const uid = (kind: string) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The stage shows an updated template or artboard: it follows its files —
 * unless it holds unsaved edits; then its name is answered (they are kept).
 */
function followOnStage(before: BuilderActionContext, plan: RegisterPlan): string | null {
  const m = before.model;
  const fresh = { ...before, model: { ...m, templates: plan.templates, artboards: plan.artboards } };
  const open = m.artboards.find((a) => a.id === m.editingArtboardId);
  if (open !== undefined && (plan.updated.artboards.includes(open.id) || plan.updated.templates.includes(open.templateId))) {
    if (artboardChanged(m, before.placedIds)) return open.name;
    openArtboardRow(fresh, open.id);
    return null;
  }
  const edited = m.templates.find((t) => t.id === m.editingTemplateId);
  if (edited === undefined || !plan.updated.templates.includes(edited.id)) return null;
  if (templateChanged(edited, m.config)) return edited.name;
  showTemplate(fresh, edited.id);
  return null;
}

function reportOf(plan: RegisterPlan, kept: string | null): string {
  const { added, updated } = plan;
  return [
    ...(added.templates + added.artboards > 0 ? [`Registered ${added.templates} template(s) and ${added.artboards} artboard(s) found in ${SHEETS_DIR}`] : []),
    ...(updated.templates.length + updated.artboards.length > 0 ? [`updated ${updated.templates.length} template(s) and ${updated.artboards.length} artboard(s) from their edited files`] : []),
    ...(plan.unresolved > 0 ? [`${plan.unresolved} icon name(s) not in the library — those cells stay empty`] : []),
    ...(kept !== null ? [`“${kept}” on the stage keeps your unsaved edits — ↺ Reset shows its files' version`] : []),
  ].join(" · ");
}

function applyPlan(get: Get, before: BuilderActionContext, plan: RegisterPlan, quiet: boolean): void {
  const changes = plan.added.templates + plan.added.artboards + plan.updated.templates.length + plan.updated.artboards.length;
  if (changes === 0) {
    if (!quiet) get().say("Nothing new or changed — every template and artboard folder matches its files");
    return;
  }
  before.dispatch({ templates: plan.templates, artboards: plan.artboards });
  saveTemplates(plan.templates);
  saveArtboards(plan.artboards);
  const kept = followOnStage(before, plan);
  get().say(reportOf(plan, kept), plan.unresolved > 0 || kept !== null);
}

async function registerNow(get: Get, quiet: boolean): Promise<void> {
  const root = sheetsRoot(get(), quiet);
  if (root === null) return;
  if (get().model.discovery === null) {
    if (!quiet) get().say("Wait until the folder is scanned — icons in sheet.json are found by name in the library", true);
    return;
  }
  const found = await findSheetFolders(root);
  const before = get();
  const plan = registerPlan({ found, templates: before.model.templates, artboards: before.model.artboards, assets: before.assets,
    now: new Date().toISOString(), newId: uid, sig: knownSig });
  for (const [path, text] of plan.adopt) rememberSig(path, text);
  applyPlan(get, before, plan, quiet);
  await syncSheetFilesNow(get, "all");
}

/** Walks, registers, updates, reports — one file job at a time. `quiet` (the automatic run) says nothing when nothing changed. */
export async function registerSheets(get: Get, quiet = false): Promise<void> {
  await exclusive(() => registerNow(get, quiet));
}

export function registerActions(get: Get): Pick<BuilderActions, "registerSheets" | "setAutoRegister"> {
  return {
    registerSheets: (quiet = false) => { void registerSheets(get, quiet); },
    setAutoRegister: (on) => {
      saveAutoRegister(on);
      get().dispatch({ autoRegister: on });
      if (on) void registerSheets(get, true);
    },
  };
}

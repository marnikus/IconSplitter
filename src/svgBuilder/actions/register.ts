// actions/register.ts — "Register templates and artboards" (2026-11-16): a user
// may add folders by hand under `_artboard_sheets` — a template folder with its
// `template.json`, and inside it artboard folders with `sheet.json` and/or
// `metadata.json`. This walks the sheets folder, registers every template folder
// the app does not know yet, then every artboard folder (inside any known
// template's folder) not known yet. By the 🗂 button, or after each scan when
// "Automatic register" is on. Nothing on disk is changed.
import { DEFAULT_CONFIG } from "../../lib/svgBuilder/config";
import { SHEETS_DIR } from "../../lib/svgBuilder/sheetfolders";
import { readPresetJson } from "../../lib/svgBuilder/presetjson";
import { newTemplate, type SheetTemplate } from "../../lib/svgBuilder/templates";
import { newArtboard, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { overridesOf } from "../../lib/svgBuilder/lookoverrides";
import type { BuilderIconAsset } from "../../lib/svgBuilder/types";
import { probePath, readTextAt, type DirHandleLike } from "../../lib/fs";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveTemplates } from "../templatestore";
import { saveArtboards } from "../artboardstore";
import { sheetsRoot } from "./sheetsroot";

export const AUTO_REGISTER_KEY = "iconSplitter.builder.autoRegister.v1";

/** A folder found on disk: its path and the JSON texts it holds (null = missing). */
export interface FoundArtboard { folder: string; sheet: string | null; meta: string | null }
export interface FoundTemplate { folder: string; json: string; artboards: FoundArtboard[] }

const subdirs = async (dir: DirHandleLike): Promise<Array<[string, DirHandleLike]>> => {
  const out: Array<[string, DirHandleLike]> = [];
  for await (const [name, h] of dir.entries()) if (h.kind === "directory") out.push([name, h as DirHandleLike]);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};

async function artboardsIn(root: DirHandleLike, folder: string, dir: DirHandleLike): Promise<FoundArtboard[]> {
  const out: FoundArtboard[] = [];
  for (const [name] of await subdirs(dir)) {
    const path = `${folder}/${name}`;
    const sheet = await readTextAt(root, `${path}/sheet.json`).catch(() => null);
    const meta = await readTextAt(root, `${path}/metadata.json`).catch(() => null);
    if (sheet !== null || meta !== null) out.push({ folder: path, sheet, meta });
  }
  return out;
}

/** Every folder holding a template.json, at any depth under _artboard_sheets (month/day/… or not). */
export async function findSheetFolders(root: DirHandleLike): Promise<FoundTemplate[]> {
  const top = await probePath(root, SHEETS_DIR).catch(() => null);
  const out: FoundTemplate[] = [];
  const walk = async (dir: DirHandleLike, path: string, depth: number): Promise<void> => {
    const json = await readTextAt(root, `${path}/template.json`).catch(() => null);
    if (json !== null) { out.push({ folder: path, json, artboards: await artboardsIn(root, path, dir) }); return; }
    if (depth < 4) for (const [name, sub] of await subdirs(dir)) await walk(sub, `${path}/${name}`, depth + 1);
  };
  if (top !== null) await walk(top, SHEETS_DIR, 0);
  return out;
}

export interface RegisterInput {
  found: readonly FoundTemplate[];
  templates: readonly SheetTemplate[];
  artboards: readonly FinalArtboard[];
  assets: readonly BuilderIconAsset[];
  now: string;
  newId: (kind: "tpl" | "art") => string;
}

/** The template a found template folder becomes (null when its JSON is unreadable). */
function templateOf(f: FoundTemplate, input: RegisterInput, taken: readonly string[]): SheetTemplate | null {
  const read = readPresetJson(f.json, DEFAULT_CONFIG, input.assets);
  if (!read.ok) return null;
  return { ...newTemplate(read.preset.config, taken, input.now, input.newId("tpl")), folder: f.folder };
}

/** A found sheet.json read onto the template (null when missing or unreadable). */
function presetOf(text: string | null, template: SheetTemplate, assets: readonly BuilderIconAsset[]) {
  const read = text === null ? null : readPresetJson(text, template.config, assets);
  return read?.ok ? read.preset : null;
}

/** Its sheet.json's words, captions and look differences from the template. */
function wordsOf(preset: ReturnType<typeof presetOf>, template: SheetTemplate): Partial<FinalArtboard> {
  if (preset === null) return {};
  const b = preset.config.banner;
  return { title: b.title, subtitle: b.subtitle, captionTexts: b.captionTexts, overrides: overridesOf(template, preset.config), lockedIds: preset.lockedIds ?? [] };
}

/** The artboard a found artboard folder becomes: its sheet.json's look, words and icons; its metadata.json. */
function artboardOf(a: FoundArtboard, template: SheetTemplate, input: RegisterInput, known: readonly FinalArtboard[]): FinalArtboard {
  const preset = presetOf(a.sheet, template, input.assets);
  const meta = presetOf(a.meta === null ? null : `{"metadata":${a.meta}}`, template, input.assets)?.metadata ?? null;
  const base = newArtboard(template, known, { now: input.now, id: input.newId("art"), placedIds: preset?.placedIds ?? [] });
  return { ...base, ...wordsOf(preset, template), folder: a.folder, metadata: meta ?? preset?.metadata ?? null };
}

/** What is new: templates first, then artboards inside every known template's folder. */
export function registerPlan(input: RegisterInput): { templates: SheetTemplate[]; artboards: FinalArtboard[] } {
  const templates = [...input.templates];
  const artboards = [...input.artboards];
  for (const f of input.found) {
    let template = templates.find((t) => t.folder === f.folder);
    if (template === undefined) {
      const made = templateOf(f, input, templates.map((t) => t.name));
      if (made === null) continue;
      templates.push(made);
      template = made;
    }
    for (const a of f.artboards) {
      if (!artboards.some((x) => x.folder === a.folder)) artboards.push(artboardOf(a, template, input, artboards));
    }
  }
  return { templates, artboards };
}

const uid = (kind: string) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Walks, registers, reports. `quiet` (the automatic run) says nothing when nothing is new. */
export async function registerSheets(get: () => BuilderActionContext, quiet = false): Promise<void> {
  const root = sheetsRoot(get(), quiet);
  if (root === null) return;
  const found = await findSheetFolders(root);
  const ctx = get();
  const plan = registerPlan({ found, templates: ctx.model.templates, artboards: ctx.model.artboards, assets: ctx.assets, now: new Date().toISOString(), newId: uid });
  const t = plan.templates.length - ctx.model.templates.length, a = plan.artboards.length - ctx.model.artboards.length;
  if (t === 0 && a === 0) { if (!quiet) ctx.say("Nothing new — every template and artboard folder is registered"); return; }
  ctx.dispatch({ templates: plan.templates, artboards: plan.artboards });
  saveTemplates(plan.templates);
  saveArtboards(plan.artboards);
  ctx.say(`Registered ${t} template(s) and ${a} artboard(s) found in ${SHEETS_DIR}`);
}

export function loadAutoRegister(): boolean {
  try { return localStorage.getItem(AUTO_REGISTER_KEY) === "1"; } catch { return false; }
}

export function registerActions(get: () => BuilderActionContext): Pick<BuilderActions, "registerSheets" | "setAutoRegister"> {
  return {
    registerSheets: (quiet = false) => { void registerSheets(get, quiet); },
    setAutoRegister: (on) => {
      try { localStorage.setItem(AUTO_REGISTER_KEY, on ? "1" : "0"); } catch { /* private mode */ }
      get().dispatch({ autoRegister: on });
      if (on) void registerSheets(get, true);
    },
  };
}

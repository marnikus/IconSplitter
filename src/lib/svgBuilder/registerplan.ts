// registerplan.ts — "Register templates and artboards" (2026-11-16; reading back
// edited files 2026-11-22). Pure. A folder under _artboard_sheets holding a
// template.json the app does not know becomes a template; an artboard folder
// (sheet.json and/or metadata.json) inside it becomes an artboard. A KNOWN one is
// updated when its file was changed outside the app: the app fingerprints every
// file it writes or reads (sheetsync.ts), so its own copies — an older one, a
// live draft — are never read back. A template.json from before fingerprints is
// read only when it is newer than the template's last save. Every file read is
// handed back (`adopt`) so its fingerprint is remembered.
import { DEFAULT_CONFIG } from "./config";
import { newArtboard, type FinalArtboard } from "./artboards";
import { overridesOf } from "./lookoverrides";
import { readPresetJson } from "./presetjson";
import { artboardFromMetaFile, artboardFromSheet, fileState, olderThanSave, sameArtboard, sameLook, templateLookFromFile } from "./sheetsync";
import { newTemplate, type SheetTemplate } from "./templates";
import type { BuilderIconAsset } from "./types";

/** A folder found on disk: its path and the JSON texts it holds (null = missing). */
export interface FoundArtboard { folder: string; sheet: string | null; meta: string | null }
export interface FoundTemplate { folder: string; json: string; modified: number; artboards: FoundArtboard[] }

export interface RegisterInput {
  found: readonly FoundTemplate[];
  templates: readonly SheetTemplate[];
  artboards: readonly FinalArtboard[];
  assets: readonly BuilderIconAsset[];
  now: string;
  newId: (kind: "tpl" | "art") => string;
  /** The fingerprint the app remembers for a file (undefined = from before fingerprints). */
  sig?: (path: string) => string | undefined;
}

export interface RegisterPlan {
  templates: SheetTemplate[];
  artboards: FinalArtboard[];
  added: { templates: number; artboards: number };
  updated: { templates: string[]; artboards: string[] };
  /** Every file read, as [path, text]: its fingerprint is remembered, so it is read again only when it changes again. */
  adopt: Array<[string, string]>;
  /** Icon names in edited sheet.json files that the library does not have (those cells stay empty). */
  unresolved: number;
}

interface Work { input: RegisterInput; plan: RegisterPlan; sig: (path: string) => string | undefined }

/** The template a found template folder becomes (null when its JSON is unreadable). */
function templateOf(f: FoundTemplate, input: RegisterInput, taken: readonly string[]): SheetTemplate | null {
  const read = readPresetJson(f.json, DEFAULT_CONFIG, input.assets);
  if (!read.ok) return null;
  return { ...newTemplate(read.preset.config, taken, input.now, input.newId("tpl")), folder: f.folder };
}

/** A found JSON read onto the template (null when missing or unreadable). */
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

/** The artboard a new artboard folder becomes: its sheet.json's look, words and icons; its metadata.json. */
function artboardOf(a: FoundArtboard, template: SheetTemplate, input: RegisterInput, known: readonly FinalArtboard[]): FinalArtboard {
  const preset = presetOf(a.sheet, template, input.assets);
  const meta = presetOf(a.meta === null ? null : `{"metadata":${a.meta}}`, template, input.assets)?.metadata ?? null;
  const base = newArtboard(template, known, { now: input.now, id: input.newId("art"), placedIds: preset?.placedIds ?? [] });
  return { ...base, ...wordsOf(preset, template), folder: a.folder, metadata: meta ?? preset?.metadata ?? null };
}

/** True — and its fingerprint adopted — when the file was changed outside the app. */
function edited(w: Work, path: string, text: string | null): text is string {
  if (text === null || fileState(text, w.sig(path)) !== "edited") return false;
  w.plan.adopt.push([path, text]);
  return true;
}

function addTemplate(w: Work, f: FoundTemplate): SheetTemplate | null {
  const made = templateOf(f, w.input, w.plan.templates.map((t) => t.name));
  if (made === null) return null;
  w.plan.templates.push(made);
  w.plan.added.templates += 1;
  w.plan.adopt.push([`${f.folder}/template.json`, f.json]);
  return made;
}

/** A known template: its template.json read back when changed outside the app (or newer than its last save, from before fingerprints). */
function updateTemplate(w: Work, t: SheetTemplate, f: FoundTemplate): void {
  const path = `${f.folder}/template.json`;
  const state = fileState(f.json, w.sig(path));
  if (state !== "edited" && !(state === "legacy" && !olderThanSave(f.modified, t.updated))) return;
  w.plan.adopt.push([path, f.json]);
  const look = templateLookFromFile(t, f.json);
  if (look === null || sameLook(look, t.config)) return;
  w.plan.templates = w.plan.templates.map((x) => (x.id === t.id ? { ...x, config: look, updated: w.input.now } : x));
  w.plan.updated.templates.push(t.id);
}

function addArtboard(w: Work, a: FoundArtboard, base: SheetTemplate): void {
  w.plan.artboards.push(artboardOf(a, base, w.input, w.plan.artboards));
  w.plan.added.artboards += 1;
  if (a.sheet !== null) w.plan.adopt.push([`${a.folder}/sheet.json`, a.sheet]);
  if (a.meta !== null) w.plan.adopt.push([`${a.folder}/metadata.json`, a.meta]);
}

/** A known artboard: its sheet.json / metadata.json read back when changed outside the app; look changes against `base`. */
function updateArtboard(w: Work, x: FinalArtboard, a: FoundArtboard, base: SheetTemplate): void {
  let next = x;
  if (edited(w, `${a.folder}/sheet.json`, a.sheet)) {
    const read = artboardFromSheet(next, base, a.sheet, w.input.assets);
    if (read !== null) { next = read.artboard; w.plan.unresolved += read.unresolved.length; }
  }
  if (edited(w, `${a.folder}/metadata.json`, a.meta)) next = artboardFromMetaFile(next, a.meta) ?? next;
  if (sameArtboard(next, x, base)) return;
  w.plan.artboards = w.plan.artboards.map((y) => (y.id === x.id ? { ...next, updated: w.input.now } : y));
  w.plan.updated.artboards.push(x.id);
}

/**
 * New templates (then their artboards), and known ones read back from edited
 * files. A known template's artboards are read against the template as it was
 * BEFORE its own update: their files were written with that look.
 */
export function registerPlan(input: RegisterInput): RegisterPlan {
  const plan: RegisterPlan = { templates: [...input.templates], artboards: [...input.artboards], added: { templates: 0, artboards: 0 },
    updated: { templates: [], artboards: [] }, adopt: [], unresolved: 0 };
  const w: Work = { input, plan, sig: input.sig ?? (() => undefined) };
  for (const f of input.found) {
    const known = plan.templates.find((t) => t.folder === f.folder);
    const base = known ?? addTemplate(w, f);
    if (base === null) continue;
    if (known !== undefined) updateTemplate(w, known, f);
    for (const a of f.artboards) {
      const x = plan.artboards.find((y) => y.folder === a.folder);
      if (x === undefined) addArtboard(w, a, base);
      else updateArtboard(w, x, a, base);
    }
  }
  return plan;
}

// actions/templates.ts — saved sheet templates (2026-11-13). Save the current
// look as a template (a generated, editable name), open one to edit it on the
// sheet (one undo entry, the sheet's words and hero kept), save the edit back,
// rename, remove. The list is a saved library, not sheet history: it is
// written to localStorage at once; applying a template IS undoable.
import {
  TEMPLATE_LIMIT, cleanTemplateName, lookOf, newTemplate, templateConfig, type SheetTemplate,
} from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveTemplates } from "../templatestore";
import { clampZoom } from "../../lib/zoom";
import { commitConfig, prefs } from "./config";
import { saveArtboards } from "../artboardstore";
import { blockLeave, editedTemplate } from "./leaveguard";
import { writeTemplateFolder } from "./templatefolder";
import { currentJson } from "./presetjson";

type TemplateActions = Pick<BuilderActions,
  "saveTemplate" | "saveTemplateAsNew" | "editTemplate" | "renameTemplate" | "removeTemplate" | "setTemplateZoom" | "resetTemplate">;

export function templateActions(get: () => BuilderActionContext): TemplateActions {
  return {
    saveTemplate: () => withFolder(get, saveTemplate(get())),
    saveTemplateAsNew: () => withFolder(get, saveAsNew(get())),
    editTemplate: (id) => editTemplate(get(), id),
    renameTemplate: (id, name) => renameTemplate(get(), id, name),
    removeTemplate: (id) => removeTemplate(get(), id),
    setTemplateZoom: (px) => prefs(get(), { templateZoom: clampZoom(px) }),
    resetTemplate: () => resetTemplate(get()),
  };
}

function store(ctx: BuilderActionContext, templates: readonly SheetTemplate[], editingTemplateId?: string | null): void {
  ctx.dispatch(editingTemplateId === undefined ? { templates } : { templates, editingTemplateId });
  saveTemplates(templates);
}

const templateId = () => `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** "Save template": the one being edited gets the current look and stays edited (2026-11-15: later changes are tracked again); otherwise a new one. */
/** Its folder and template.json, right after it is created or saved (2026-11-16); the blueprint is the sheet as it is now. */
function withFolder(get: () => BuilderActionContext, saved: SheetTemplate | null): void {
  if (saved !== null) void writeTemplateFolder(get, saved, currentJson(get()));
}

export function saveTemplate(ctx: BuilderActionContext): SheetTemplate | null {
  const editing = ctx.model.templates.find((t) => t.id === ctx.model.editingTemplateId);
  if (editing === undefined) return saveAsNew(ctx);
  const updated: SheetTemplate = { ...editing, config: lookOf(ctx.model.config), updated: new Date().toISOString() };
  store(ctx, ctx.model.templates.map((t) => (t.id === editing.id ? updated : t)), editing.id);
  ctx.say(`Template “${editing.name}” saved`);
  return updated;
}

function saveAsNew(ctx: BuilderActionContext): SheetTemplate | null {
  const list = ctx.model.templates;
  if (list.length >= TEMPLATE_LIMIT) { ctx.say(`At most ${TEMPLATE_LIMIT} templates — remove one first`, true); return null; }
  const created = newTemplate(ctx.model.config, list.map((t) => t.name), new Date().toISOString(), templateId());
  store(ctx, [...list, created], created.id); // the new template is the one being edited: later changes are tracked
  ctx.say(`Saved as template “${created.name}” — rename it on its block`);
  return created;
}

/** Opens a template on the sheet to edit its design, with its sample words (one undo entry). */
/** ✎: opens the template's design; a changed template first asks Save / Discard (`guard` false = already answered). */
export function editTemplate(ctx: BuilderActionContext, id: string, guard = true): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return ctx.say("That template is gone", true);
  if (guard && blockLeave(ctx, { kind: "template", id })) return;
  commitConfig(ctx, { config: templateConfig(template), label: `Template “${template.name}”` });
  ctx.dispatch({ editingTemplateId: id, editingArtboardId: null, // editing the blueprint, not an artboard
    templateSel: { ...ctx.model.templateSel, active: id, anchor: id }, // and it is the selected template
    artboardSel: { ...ctx.model.artboardSel, active: null } }); // no artboard row looks edited (2026-11-14)
  prefs(ctx, { layout: "custom", fit: true });
  ctx.say(`Editing template “${template.name}” — change the sheet, then ✓ Save template`);
}

/** Reset (2026-11-14): the sheet back to the edited template's saved look — one undo step. */
function resetTemplate(ctx: BuilderActionContext): void {
  const template = editedTemplate(ctx.model);
  if (template === null) return;
  commitConfig(ctx, { config: templateConfig(template), label: `Reset “${template.name}”` });
  ctx.say(`Template “${template.name}” reset to its saved look`);
}

function renameTemplate(ctx: BuilderActionContext, id: string, name: string): void {
  const clean = cleanTemplateName(name);
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined || clean === template.name) return;
  if (clean === "") return ctx.say("A template needs a name", true);
  store(ctx, ctx.model.templates.map((t) => (t.id === id ? { ...t, name: clean } : t)));
}

/** A removed template takes its final artboards with it. */
function dropArtboardsOf(ctx: BuilderActionContext, templateId: string): void {
  const kept = ctx.model.artboards.filter((a) => a.templateId !== templateId);
  const sel = ctx.model.templateSel;
  const open = ctx.model.artboards.find((a) => a.id === ctx.model.editingArtboardId);
  ctx.dispatch({
    artboards: kept, templateSel: { checked: sel.checked.filter((x) => x !== templateId), active: sel.active === templateId ? null : sel.active, anchor: null },
    ...(open?.templateId === templateId ? { editingArtboardId: null } : {}),
  });
  saveArtboards(kept);
}

function removeTemplate(ctx: BuilderActionContext, id: string): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return;
  const shown = ctx.model.editingTemplateId === id || ctx.model.artboards.some((a) => a.id === ctx.model.editingArtboardId && a.templateId === id);
  const next = shown ? neighbourTemplate(ctx.model.templates, id) : null;
  store(ctx, ctx.model.templates.filter((t) => t.id !== id), ctx.model.editingTemplateId === id ? null : undefined);
  dropArtboardsOf(ctx, id);
  ctx.say(`Template “${template.name}” removed`);
  if (next !== null) { ctx.dispatch({ templateSel: { ...ctx.model.templateSel, active: next, anchor: next } }); editTemplate(ctx, next, false); }
}

/** The template the stage moves to when the shown one is removed (2026-11-16): the one above, else below — no dead preview. */
function neighbourTemplate(all: readonly SheetTemplate[], id: string): string | null {
  const at = all.findIndex((t) => t.id === id);
  return (all[at - 1] ?? all[at + 1])?.id ?? null;
}

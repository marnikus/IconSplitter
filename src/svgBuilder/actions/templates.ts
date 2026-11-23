// actions/templates.ts — saved sheet templates (2026-11-13). Save the current
// look as a template (a generated, editable name), open one to edit it on the
// sheet (one undo entry, the sheet's words and hero kept), save the edit back,
// rename. The list is a saved library, written to localStorage at once;
// applying a template IS undoable, and so is removing one (sheetlists.ts, 2026-11-22).
import {
  TEMPLATE_LIMIT, cleanTemplateName, lookOf, newTemplate, templateConfig, type SheetTemplate,
} from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveTemplates } from "../templatestore";
import { saveSheetConfig } from "../configstore";
import { clampZoom } from "../../lib/zoom";
import { commitConfig, prefs } from "./config";
import { blockLeave, editedTemplate } from "./leaveguard";
import { writeTemplateFolder } from "./templatefolder";
import { currentJson } from "./presetjson";

type TemplateActions = Pick<BuilderActions,
  "saveTemplate" | "saveTemplateAsNew" | "editTemplate" | "renameTemplate" | "setTemplateZoom" | "resetTemplate">;

export function templateActions(get: () => BuilderActionContext): TemplateActions {
  return {
    saveTemplate: () => withFolder(get, saveTemplate(get())),
    saveTemplateAsNew: () => withFolder(get, saveAsNew(get())),
    editTemplate: (id) => editTemplate(get(), id),
    renameTemplate: (id, name) => renameTemplate(get(), id, name),
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

/**
 * Puts a template on the stage WITHOUT an undo step (2026-11-22): where the stage
 * goes when what it showed was removed, or undone away — like opening an
 * artboard, this is navigation, so the removal stays one Undo away.
 */
export function showTemplate(ctx: BuilderActionContext, id: string): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return;
  const config = templateConfig(template);
  ctx.dispatch({ config, editingTemplateId: id, editingArtboardId: null,
    templateSel: { ...ctx.model.templateSel, active: id, anchor: id }, artboardSel: { ...ctx.model.artboardSel, active: null } });
  saveSheetConfig(config);
  prefs(ctx, { layout: "custom", fit: true });
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


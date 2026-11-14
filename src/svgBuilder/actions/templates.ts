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

type TemplateActions = Pick<BuilderActions,
  "saveTemplate" | "saveTemplateAsNew" | "editTemplate" | "renameTemplate" | "removeTemplate" | "setTemplateZoom" | "resetTemplate">;

export function templateActions(get: () => BuilderActionContext): TemplateActions {
  return {
    saveTemplate: () => saveTemplate(get()),
    saveTemplateAsNew: () => saveAsNew(get()),
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

/** "Save template": the one being edited gets the current look, and editing ends (2026-11-14); otherwise a new one. */
export function saveTemplate(ctx: BuilderActionContext): void {
  const editing = ctx.model.templates.find((t) => t.id === ctx.model.editingTemplateId);
  if (editing === undefined) return saveAsNew(ctx);
  const updated: SheetTemplate = { ...editing, config: lookOf(ctx.model.config), updated: new Date().toISOString() };
  store(ctx, ctx.model.templates.map((t) => (t.id === editing.id ? updated : t)), null);
  ctx.say(`Template “${editing.name}” saved`);
}

function saveAsNew(ctx: BuilderActionContext): void {
  const list = ctx.model.templates;
  if (list.length >= TEMPLATE_LIMIT) return ctx.say(`At most ${TEMPLATE_LIMIT} templates — remove one first`, true);
  const created = newTemplate(ctx.model.config, list.map((t) => t.name), new Date().toISOString(), templateId());
  store(ctx, [...list, created], null); // saved: nothing left to edit
  ctx.say(`Saved as template “${created.name}” — rename it on its block`);
}

/** Opens a template on the sheet to edit its design, with its sample words (one undo entry). */
/** ✎: opens the template's design; a changed template first asks Save / Discard (`guard` false = already answered). */
export function editTemplate(ctx: BuilderActionContext, id: string, guard = true): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return ctx.say("That template is gone", true);
  if (guard && blockLeave(ctx, { kind: "template", id })) return;
  commitConfig(ctx, { config: templateConfig(template), label: `Template “${template.name}”` });
  ctx.dispatch({ editingTemplateId: id, editingArtboardId: null, // editing the blueprint, not an artboard
    templateSel: { ...ctx.model.templateSel, active: id, anchor: id } }); // and it is the selected template
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
  const editing = ctx.model.editingTemplateId === id ? null : undefined;
  store(ctx, ctx.model.templates.filter((t) => t.id !== id), editing);
  dropArtboardsOf(ctx, id);
  ctx.say(`Template “${template.name}” removed`);
}

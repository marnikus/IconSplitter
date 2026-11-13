// actions/templates.ts — saved sheet templates (2026-11-13). Save the current
// look as a template (a generated, editable name), open one to edit it on the
// sheet (one undo entry, the sheet's words and hero kept), save the edit back,
// rename, remove. The list is a saved library, not sheet history: it is
// written to localStorage at once; applying a template IS undoable.
import {
  TEMPLATE_LIMIT, applyTemplate, cleanTemplateName, lookOf, newTemplate, type SheetTemplate,
} from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveTemplates } from "../templatestore";
import { commitConfig, prefs } from "./config";

type TemplateActions = Pick<BuilderActions,
  "saveTemplate" | "saveTemplateAsNew" | "editTemplate" | "stopEditingTemplate" | "renameTemplate" | "removeTemplate">;

export function templateActions(get: () => BuilderActionContext): TemplateActions {
  return {
    saveTemplate: () => saveTemplate(get()),
    saveTemplateAsNew: () => saveAsNew(get()),
    editTemplate: (id) => editTemplate(get(), id),
    stopEditingTemplate: () => get().dispatch({ editingTemplateId: null }),
    renameTemplate: (id, name) => renameTemplate(get(), id, name),
    removeTemplate: (id) => removeTemplate(get(), id),
  };
}

function store(ctx: BuilderActionContext, templates: readonly SheetTemplate[], editingTemplateId?: string | null): void {
  ctx.dispatch(editingTemplateId === undefined ? { templates } : { templates, editingTemplateId });
  saveTemplates(templates);
}

const templateId = () => `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** "Save template": the one being edited gets the current look; otherwise a new one. */
function saveTemplate(ctx: BuilderActionContext): void {
  const editing = ctx.model.templates.find((t) => t.id === ctx.model.editingTemplateId);
  if (editing === undefined) return saveAsNew(ctx);
  const updated: SheetTemplate = { ...editing, config: lookOf(ctx.model.config), updated: new Date().toISOString() };
  store(ctx, ctx.model.templates.map((t) => (t.id === editing.id ? updated : t)));
  ctx.say(`Template “${editing.name}” saved`);
}

function saveAsNew(ctx: BuilderActionContext): void {
  const list = ctx.model.templates;
  if (list.length >= TEMPLATE_LIMIT) return ctx.say(`At most ${TEMPLATE_LIMIT} templates — remove one first`, true);
  const created = newTemplate(ctx.model.config, list.map((t) => t.name), new Date().toISOString(), templateId());
  store(ctx, [...list, created], created.id);
  ctx.say(`Saved as template “${created.name}” — rename it on its block`);
}

/** Opens a template on the sheet to edit it: one undo entry; the sheet's words and hero stay. */
function editTemplate(ctx: BuilderActionContext, id: string): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return ctx.say("That template is gone", true);
  commitConfig(ctx, { config: applyTemplate(ctx.model.config, template), label: `Template “${template.name}”` });
  ctx.dispatch({ editingTemplateId: id });
  prefs(ctx, { layout: "custom", fit: true });
  ctx.say(`Editing template “${template.name}” — change the sheet, then Save template`);
}

function renameTemplate(ctx: BuilderActionContext, id: string, name: string): void {
  const clean = cleanTemplateName(name);
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined || clean === template.name) return;
  if (clean === "") return ctx.say("A template needs a name", true);
  store(ctx, ctx.model.templates.map((t) => (t.id === id ? { ...t, name: clean } : t)));
}

function removeTemplate(ctx: BuilderActionContext, id: string): void {
  const template = ctx.model.templates.find((t) => t.id === id);
  if (template === undefined) return;
  const editing = ctx.model.editingTemplateId === id ? null : undefined;
  store(ctx, ctx.model.templates.filter((t) => t.id !== id), editing);
  ctx.say(`Template “${template.name}” removed`);
}

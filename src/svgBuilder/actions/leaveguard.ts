// actions/leaveguard.ts — leaving a template with unsaved edits (2026-11-14).
// Opening another template, an artboard or a new artboard first asks Save /
// Discard / Cancel when the sheet's look differs from the edited template.
import { templateChanged, type SheetTemplate } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext } from "../actiontypes";
import type { BuilderModel, LeaveTarget } from "../model";

/** The template being edited, if any. */
export function editedTemplate(model: Pick<BuilderModel, "templates" | "editingTemplateId">): SheetTemplate | null {
  return model.templates.find((t) => t.id === model.editingTemplateId) ?? null;
}

/** True (and the question opens) when leaving would lose edits; false = go on. */
export function blockLeave(ctx: BuilderActionContext, to: LeaveTarget): boolean {
  const template = editedTemplate(ctx.model);
  if (template === null || !templateChanged(template, ctx.model.config)) return false;
  ctx.dispatch({ dialog: "leave-template", leaveTo: to });
  return true;
}

// actions/leaveguard.ts — leaving unsaved edits (2026-11-14). Opening another
// template, an artboard or a new artboard first asks Save / Discard / Cancel
// when the template being edited or the open artboard has unsaved changes.
import { templateChanged, type SheetTemplate } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext } from "../actiontypes";
import type { BuilderModel, LeaveTarget } from "../model";
import { artboardChanged, openArtboardOf } from "../artboarddraft";

/** The template being edited, if any. */
export function editedTemplate(model: Pick<BuilderModel, "templates" | "editingTemplateId">): SheetTemplate | null {
  return model.templates.find((t) => t.id === model.editingTemplateId) ?? null;
}

/** What has unsaved edits now: the open artboard or the edited template (null = nothing to lose). */
export function unsavedSubject(ctx: Pick<BuilderActionContext, "model" | "placedIds">): { kind: "artboard" | "template"; name: string } | null {
  const artboard = openArtboardOf(ctx.model);
  if (artboard !== null) return artboardChanged(ctx.model, ctx.placedIds) ? { kind: "artboard", name: artboard.name } : null;
  const template = editedTemplate(ctx.model);
  return template !== null && templateChanged(template, ctx.model.config) ? { kind: "template", name: template.name } : null;
}

/** True (and the question opens) when leaving would lose edits; false = go on. */
export function blockLeave(ctx: BuilderActionContext, to: LeaveTarget): boolean {
  if (unsavedSubject(ctx) === null) return false;
  ctx.dispatch({ dialog: "leave-template", leaveTo: to });
  return true;
}

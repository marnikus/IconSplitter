// actions/leave.ts — the answers to "Save changes?" (2026-11-14) for the edited
// template or the open artboard: Save writes it, Discard drops the edits; both
// then go where the user was going. Cancel stays, edits kept.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { editTemplate, saveTemplate } from "./templates";
import { seedArtboardFolder } from "./sheetexport";
import { addArtboard, openArtboardRow, saveArtboard } from "./artboards";

type LeaveActions = Pick<BuilderActions, "leaveSave" | "leaveDiscard" | "leaveCancel">;

export function leaveActions(get: () => BuilderActionContext): LeaveActions {
  return {
    leaveSave: () => { const c = get(); if (c.model.editingArtboardId !== null) saveArtboard(c); else saveTemplate(c); goOn(c, get); },
    leaveDiscard: () => goOn(get(), get),
    leaveCancel: () => get().dispatch({ dialog: "none", leaveTo: null }),
  };
}

function goOn(ctx: BuilderActionContext, get: () => BuilderActionContext): void {
  const to = ctx.model.leaveTo;
  ctx.dispatch({ dialog: "none", leaveTo: null, editingTemplateId: null });
  if (to === null) return;
  if (to.kind === "template") editTemplate(ctx, to.id, false);
  else if (to.kind === "add-artboard") { const id = addArtboard(ctx, to.id, false); if (id !== null) void seedArtboardFolder(get, id); }
  else openArtboardRow(ctx, to.id);
}

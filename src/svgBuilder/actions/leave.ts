// actions/leave.ts — the answers to "Save changes to the template?" (2026-11-14):
// Save writes the look back, Discard drops it; both then go where the user was
// going. Cancel stays on the template with its edits.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { editTemplate, saveTemplate } from "./templates";
import { addArtboard, openArtboardRow } from "./artboards";

type LeaveActions = Pick<BuilderActions, "leaveSave" | "leaveDiscard" | "leaveCancel">;

export function leaveActions(get: () => BuilderActionContext): LeaveActions {
  return {
    leaveSave: () => { const c = get(); saveTemplate(c); goOn(c); },
    leaveDiscard: () => goOn(get()),
    leaveCancel: () => get().dispatch({ dialog: "none", leaveTo: null }),
  };
}

function goOn(ctx: BuilderActionContext): void {
  const to = ctx.model.leaveTo;
  ctx.dispatch({ dialog: "none", leaveTo: null, editingTemplateId: null });
  if (to === null) return;
  if (to.kind === "template") editTemplate(ctx, to.id, false);
  else if (to.kind === "add-artboard") addArtboard(ctx, to.id, false);
  else openArtboardRow(ctx, to.id);
}

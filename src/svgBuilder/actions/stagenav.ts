// actions/stagenav.ts — ◀ ▶ / ← → open the previous / next template, ↑ ↓ the
// previous / next artboard of the template being worked on (2026-11-23, stagenav.ts).
// Opening goes the usual way: a changed template or artboard asks Save / Discard first.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { steppedArtboard, steppedTemplate, type Step } from "../stagenav";
import { openArtboardRow } from "./artboards";
import { blockLeave } from "./leaveguard";
import { editTemplate } from "./templates";

export function stageNavActions(get: () => BuilderActionContext): Pick<BuilderActions, "stepTemplate" | "stepArtboard"> {
  return {
    stepTemplate: (by) => stepTemplate(get(), by),
    stepArtboard: (by) => stepArtboard(get(), by),
  };
}

function stepTemplate(ctx: BuilderActionContext, by: Step): void {
  const id = steppedTemplate(ctx.model, by);
  if (id !== null) editTemplate(ctx, id);
}

function stepArtboard(ctx: BuilderActionContext, by: Step): void {
  const id = steppedArtboard(ctx.model, by);
  if (id !== null && !blockLeave(ctx, { kind: "artboard", id })) openArtboardRow(ctx, id);
}

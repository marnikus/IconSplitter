// actions/ui.ts — dialog state only; no rules are duplicated here.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type UiActions = Pick<BuilderActions, "openBrief" | "closeDialog">;

export function uiActions(get: () => BuilderActionContext): UiActions {
  return {
    openBrief: () => get().dispatch({ dialog: "brief" }),
    closeDialog: () => get().dispatch({ dialog: "none", draft: null, preview: null }),
  };
}

// actions/ui.ts — dialog state only; no rules are duplicated here.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type UiActions = Pick<BuilderActions, "openBrief" | "openMetadata" | "closeDialog" | "say">;

export function uiActions(get: () => BuilderActionContext): UiActions {
  return {
    openBrief: () => get().dispatch({ dialog: "brief" }),
    openMetadata: () => get().dispatch({ dialog: "metaSetup" }),
    say: (message, error) => get().say(message, error),
    closeDialog: () => get().dispatch({ dialog: "none", draft: null, preview: null }),
  };
}

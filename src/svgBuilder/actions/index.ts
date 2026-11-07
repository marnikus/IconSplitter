// actions/index.ts — one stable BuilderActions object from cohesive slices.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { configActions } from "./config";
import { exportActions } from "./export";
import { folderActions } from "./folder";
import { indexingActions } from "./indexing";
import { providerActions } from "./provider";
import { selectionActions } from "./selection";
import { uiActions } from "./ui";

export function createBuilderActions(get: () => BuilderActionContext): BuilderActions {
  const folder = folderActions(get);
  const config = configActions(get);
  const selection = selectionActions(get);
  const provider = providerActions(get);
  const exported = exportActions(get);
  const ui = uiActions(get);
  const indexing = indexingActions(get);
  return {
    ...folder, ...config, ...selection, ...provider, ...exported, ...ui, ...indexing,
    presets: get().presetActions,
  };
}

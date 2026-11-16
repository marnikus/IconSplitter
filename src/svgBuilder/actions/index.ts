// actions/index.ts — one stable BuilderActions object from cohesive slices.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { configActions } from "./config";
import { exportActions } from "./export";
import { folderActions } from "./folder";
import { indexingActions } from "./indexing";
import { providerActions } from "./provider";
import { selectionActions } from "./selection";
import { templateActions } from "./templates";
import { presetJsonActions } from "./presetjson";
import { artboardActions } from "./artboards";
import { artboardMetaActions } from "./artboardmeta";
import { declineActions } from "./decline";
import { uiActions } from "./ui";
import { leaveActions } from "./leave";
import { sheetExportActions } from "./sheetexport";
import { locationActions } from "./location";
import { artboardMetaEditActions } from "./artboardmetaedit";

export function createBuilderActions(get: () => BuilderActionContext): BuilderActions {
  const folder = folderActions(get);
  const config = configActions(get);
  const selection = selectionActions(get);
  const provider = providerActions(get);
  const exported = exportActions(get);
  const ui = uiActions(get);
  const indexing = indexingActions(get);
  const templates = templateActions(get);
  const presetJson = presetJsonActions(get);
  const artboards = artboardActions(get);
  const artboardMeta = artboardMetaActions(get);
  const decline = declineActions(get);
  const leave = leaveActions(get);
  const sheetExport = sheetExportActions(get);
  const location = locationActions(get);
  const metaEdit = artboardMetaEditActions(get);
  return {
    ...folder, ...config, ...selection, ...provider, ...exported, ...ui, ...indexing, ...templates, ...presetJson, ...artboards, ...artboardMeta, ...decline, ...leave, ...sheetExport, ...metaEdit, ...location,
    presets: get().presetActions,
  };
}

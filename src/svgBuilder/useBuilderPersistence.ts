// useBuilderPersistence.ts — one owner per persisted value and the global
// history applier. Undo restores config without recording a second history step.
import { useEffect } from "react";
import { parseBuilderUndoPatch } from "../lib/svgBuilder/undo";
import { patchOfConfigUndo, type BuilderModel } from "./model";
import { saveSheetConfig } from "./configstore";
import { saveBuilderPrefs } from "./prefsstore";
import { saveBuilderPrompt } from "./promptstore";
import { useSaveBuilderListView } from "./listview";
import { bindBuilderConfigApplier } from "./undoBinding";
import { patchBuilder } from "../state/appstore";

export function useBuilderPersistence(model: BuilderModel, patch: (value: Partial<BuilderModel>) => void): void {
  useEffect(() => { saveSheetConfig(model.config); }, [model.config]);
  useEffect(() => { saveBuilderPrefs(model.prefs); }, [model.prefs]);
  useEffect(() => { saveBuilderPrompt(model.prompt); }, [model.prompt]);
  useSaveBuilderListView(model.listView);
  // Locks and exclusions live in the session's builder slice, so the autosave stores them at once (a selection slice).
  useEffect(() => { patchBuilder({ lockedIds: [...model.lockedIds], excludedIds: [...model.excludedIds] }); }, [model.lockedIds, model.excludedIds]);
  useEffect(() => bindBuilderConfigApplier((value) => {
    const parsed = parseBuilderUndoPatch(value);
    if (parsed === null) return false;
    patch(patchOfConfigUndo(parsed));
    saveSheetConfig(parsed.config);
    return true;
  }), [patch]);
}

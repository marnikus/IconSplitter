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
import { getAppState, patchBuilder } from "../state/appstore";

export function useBuilderPersistence(model: BuilderModel, patch: (value: Partial<BuilderModel>) => void): void {
  useEffect(() => { saveSheetConfig(model.config); }, [model.config]);
  useEffect(() => { saveBuilderPrefs(model.prefs); }, [model.prefs]);
  useEffect(() => { saveBuilderPrompt(model.prompt); }, [model.prompt]);
  useSaveBuilderListView(model.listView);
  // Locks and exclusions live in the session's builder slice, so the autosave stores them at once (a selection slice).
  useEffect(() => { syncBuilderMarks(model.lockedIds, model.excludedIds); }, [model.lockedIds, model.excludedIds]);
  useEffect(() => bindBuilderConfigApplier((value) => {
    const parsed = parseBuilderUndoPatch(value);
    if (parsed === null) return false;
    patch(patchOfConfigUndo(parsed));
    saveSheetConfig(parsed.config);
    return true;
  }), [patch]);
}

/** Mirrors locks / exclusions into the session slice — only when they differ, so a mount is never a gesture. */
export function syncBuilderMarks(locked: readonly string[], excluded: readonly string[]): void {
  const b = getAppState().builder;
  if (sameIds(b.lockedIds ?? [], locked) && sameIds(b.excludedIds ?? [], excluded)) return;
  patchBuilder({ lockedIds: [...locked], excludedIds: [...excluded] });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

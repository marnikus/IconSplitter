// useBuilderPersistence.ts — one owner per persisted value and the global
// history applier. Undo restores config without recording a second history step.
import { useEffect, useRef } from "react";
import { parseBuilderUndoPatch } from "../lib/svgBuilder/undo";
import { patchOfConfigUndo, type BuilderModel } from "./model";
import { saveSheetConfig } from "./configstore";
import { saveBuilderPrefs } from "./prefsstore";
import { saveBuilderPrompt } from "./promptstore";
import { useSaveBuilderListView } from "./listview";
import { bindBuilderConfigApplier } from "./undoBinding";
import { bindArtboardsApplier } from "./artboardsundo";
import { saveArtboards } from "./artboardstore";
import { getAppState, patchBuilder } from "../state/appstore";

export function useBuilderPersistence(model: BuilderModel, patch: (value: Partial<BuilderModel>) => void): void {
  useEffect(() => { saveSheetConfig(model.config); }, [model.config]);
  useEffect(() => { saveBuilderPrefs(model.prefs); }, [model.prefs]);
  useEffect(() => { saveBuilderPrompt(model.prompt); }, [model.prompt]);
  useSaveBuilderListView(model.listView);
  // Locks and exclusions live in the session's builder slice, so the autosave stores them at once (a selection slice).
  useEffect(() => { syncBuilderMarks(model.lockedIds, model.excludedIds); }, [model.lockedIds, model.excludedIds]);
  // What is open on the stage survives a reload (2026-11-14).
  useEffect(() => { syncOpenOnStage(model.editingArtboardId, model.editingTemplateId); }, [model.editingArtboardId, model.editingTemplateId]);
  // Undo / redo of adding / removing artboards (2026-11-16): the list comes back; an open artboard that is gone closes.
  const openId = useRef(model.editingArtboardId);
  openId.current = model.editingArtboardId;
  useEffect(() => bindArtboardsApplier((artboards) => {
    const stillOpen = openId.current !== null && artboards.some((a) => a.id === openId.current);
    patch({ artboards, ...(stillOpen ? {} : { editingArtboardId: null }) });
    saveArtboards(artboards);
    return true;
  }), [patch]);
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

/** Mirrors the open artboard / template into the session slice — only when it changed. */
export function syncOpenOnStage(editingArtboardId: string | null, editingTemplateId: string | null): void {
  const b = getAppState().builder;
  if ((b.editingArtboardId ?? null) === editingArtboardId && (b.editingTemplateId ?? null) === editingTemplateId) return;
  patchBuilder({ editingArtboardId, editingTemplateId });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

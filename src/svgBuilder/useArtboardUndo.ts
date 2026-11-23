// useArtboardUndo.ts — undo / redo of adding / removing artboards and templates
// (2026-11-16, templates and folders 2026-11-22): the lists — and the folders in
// `_artboard_sheets/.removed versions` — come back through the same path as a
// removal (actions/sheetlists.ts). When a step takes away the artboard OPEN on
// the stage, the stage moves to the artboard viewed before it (the most recent
// one that still exists), else another artboard of its template, else that
// template itself — never a dead view of something that is gone.
import { useEffect, useRef } from "react";
import type { BuilderActions } from "./actiontypes";
import { bindArtboardsApplier } from "./artboardsundo";
import type { BuilderModel } from "./model";

export function useArtboardUndo(model: BuilderModel, actions: BuilderActions): void {
  const recent = useRef<string[]>([]);
  useEffect(() => {
    const id = model.editingArtboardId;
    if (id !== null) recent.current = [id, ...recent.current.filter((x) => x !== id)].slice(0, 20);
  }, [model.editingArtboardId]);
  useEffect(() => bindArtboardsApplier((side) => actions.applySheetLists(side, recent.current)), [actions]);
}

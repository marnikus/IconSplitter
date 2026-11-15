// useArtboardUndo.ts — undo / redo of adding / removing artboards (2026-11-16):
// the artboard list comes back; when it takes away the artboard OPEN on the
// stage, the stage moves to the artboard viewed before it (the most recent one
// that still exists), else another artboard of its template, else that template
// itself — never a dead view of an artboard that is gone.
import { useEffect, useRef } from "react";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import type { BuilderActions } from "./actiontypes";
import { bindArtboardsApplier } from "./artboardsundo";
import { saveArtboards } from "./artboardstore";
import type { BuilderModel } from "./model";

/** Where the stage goes when the open artboard is gone: a recent one, a sibling, or none (its template). */
export function nextOpen(recent: readonly string[], gone: string, artboards: readonly FinalArtboard[], templateId: string | null): string | null {
  const exists = (id: string) => id !== gone && artboards.some((a) => a.id === id);
  return recent.find(exists) ?? artboards.find((a) => a.templateId === templateId)?.id ?? null;
}

export function useArtboardUndo(model: BuilderModel, actions: BuilderActions, patch: (value: Partial<BuilderModel>) => void): void {
  const recent = useRef<string[]>([]);
  const live = useRef(model);
  live.current = model;
  useEffect(() => {
    const id = model.editingArtboardId;
    if (id !== null) recent.current = [id, ...recent.current.filter((x) => x !== id)].slice(0, 20);
  }, [model.editingArtboardId]);
  useEffect(() => bindArtboardsApplier((artboards) => {
    const m = live.current, open = m.editingArtboardId;
    patch({ artboards });
    saveArtboards(artboards);
    if (open !== null && !artboards.some((a) => a.id === open)) {
      const templateId = m.artboards.find((a) => a.id === open)?.templateId ?? null;
      actions.showArtboard(nextOpen(recent.current, open, artboards, templateId), templateId);
    }
    return true;
  }), [patch, actions]);
}

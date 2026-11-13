// useArtboardSync.ts — while a final artboard is open on the stage, every edit
// there (banner words, hero, icons, locks, sheet metadata) is written back to it
// (2026-11-13). The first render after an artboard opens is skipped: the stage
// may still show the previous sheet for that one render, and copying it would
// overwrite the artboard just opened.
import { useEffect, useRef } from "react";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import { saveArtboards } from "./artboardstore";
import type { BuilderModel } from "./model";

function same(a: FinalArtboard, b: FinalArtboard): boolean {
  return JSON.stringify({ ...a, updated: "" }) === JSON.stringify({ ...b, updated: "" });
}

/** The artboard as the stage shows it now. */
export function artboardFromStage(a: FinalArtboard, m: BuilderModel, placedIds: readonly string[]): FinalArtboard {
  const banner = m.config.banner;
  return {
    ...a, title: banner.title, subtitle: banner.subtitle, heroIconId: banner.heroIconId,
    placedIds: [...placedIds], lockedIds: [...m.lockedIds], metadata: m.metadata,
  };
}

export function useArtboardSync(m: BuilderModel, placedIds: readonly string[], patch: (value: Partial<BuilderModel>) => void): void {
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const id = m.editingArtboardId;
    if (id !== opened.current) { opened.current = id; return; }
    const current = m.artboards.find((a) => a.id === id);
    if (id === null || current === undefined) return;
    const next = artboardFromStage(current, m, placedIds);
    if (same(current, next)) return;
    const artboards = m.artboards.map((a) => (a.id === id ? { ...next, updated: new Date().toISOString() } : a));
    patch({ artboards });
    saveArtboards(artboards);
  }, [m, placedIds, patch]);
}

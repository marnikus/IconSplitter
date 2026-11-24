// useSheetFileMirror.ts — the artboards' JSON files follow their SAVED state
// (2026-11-22). When an artboard changes (saved, metadata accepted, icons gone,
// ↺ Template…), when its template's look changes, or when it stops being the
// one open on the stage (its sheet.json may hold a dropped draft), its
// sheet.json / metadata.json are brought up to date — one write per pause
// (actions/sheetsync.ts; never over a file changed outside the app). A folder's
// first scan checks every template and artboard file once.
import { useEffect, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import type { SheetTemplate } from "../lib/svgBuilder/templates";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { BuilderActions } from "./actiontypes";
import type { BuilderModel } from "./model";

export interface Seen {
  root: DirHandleLike | null;
  artboards: ReadonlyMap<string, FinalArtboard>;
  looks: ReadonlyMap<string, SheetConfig>;
  open: string | null;
}

export function seenOf(root: DirHandleLike | null, artboards: readonly FinalArtboard[], templates: readonly SheetTemplate[], open: string | null): Seen {
  return { root, artboards: new Map(artboards.map((a) => [a.id, a])), looks: new Map(templates.map((t) => [t.id, t.config])), open };
}

function sameArtboardText(a: FinalArtboard, b: FinalArtboard): boolean {
  return a.folder === b.folder && a.name === b.name && a.title === b.title && a.subtitle === b.subtitle && a.uploadName === b.uploadName;
}

function sameMirroredArtboard(a: FinalArtboard | undefined, b: FinalArtboard): boolean {
  if (a === b) return true;
  if (a === undefined || !sameArtboardText(a, b)) return false;
  return a.templateId === b.templateId && a.heroIconId === b.heroIconId && a.placedIds === b.placedIds
    && a.lockedIds === b.lockedIds && a.captionTexts === b.captionTexts && a.metadata === b.metadata && a.overrides === b.overrides;
}

/** Artboards whose saved state or template look changed, and the one just closed. */
export function changedArtboards(prev: Seen, next: Seen): string[] {
  const out = [...next.artboards.values()]
    .filter((a) => !sameMirroredArtboard(prev.artboards.get(a.id), a) || prev.looks.get(a.templateId) !== next.looks.get(a.templateId)).map((a) => a.id);
  if (prev.open !== null && prev.open !== next.open && next.artboards.has(prev.open) && !out.includes(prev.open)) out.push(prev.open);
  return out;
}

export function useSheetFileMirror(model: BuilderModel, actions: BuilderActions): void {
  const seen = useRef<Seen | null>(null);
  const pending = useRef(new Set<string>());
  const { root, artboards, templates, editingArtboardId } = model;
  const hasDiscovery = model.discovery !== null;
  const isBusy = model.busy !== null;
  useEffect(() => {
    if (!hasDiscovery) return; // icons are named from the scanned library
    const next = seenOf(root, artboards, templates, editingArtboardId);
    const prev = seen.current;
    seen.current = next;
    if (prev === null || prev.root !== next.root) { actions.syncSheetFiles("all"); return; }
    for (const id of changedArtboards(prev, next)) pending.current.add(id);
    if (isBusy || pending.current.size === 0) return;
    const timer = setTimeout(() => { const ids = [...pending.current]; pending.current.clear(); actions.syncSheetFiles(ids); }, 600);
    return () => clearTimeout(timer);
  }, [hasDiscovery, isBusy, root, artboards, templates, editingArtboardId, actions]);
}

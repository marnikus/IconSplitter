// artboardsundo.ts — adding and removing final artboards are undo steps
// (2026-11-16): one global history entry ("builderArtboards") holds the whole
// artboard list before and after; undo / redo put that list back (validated on
// the way in). The mounted builder lends the applier, like the config one.
import { parseArtboards, type FinalArtboard } from "../lib/svgBuilder/artboards";
import { isRecord } from "../lib/isrecord";

type ArtboardsApplier = (artboards: FinalArtboard[]) => boolean;
let applier: ArtboardsApplier | null = null;

export function bindArtboardsApplier(next: ArtboardsApplier): () => void {
  applier = next;
  return () => { if (applier === next) applier = null; };
}

export function applyBuilderArtboards(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.artboards) || applier === null) return false;
  return applier(parseArtboards(value.artboards));
}

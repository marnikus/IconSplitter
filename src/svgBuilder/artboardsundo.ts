// artboardsundo.ts — adding and removing final artboards and templates are undo
// steps (2026-11-16; templates and folders 2026-11-22): one global history entry
// ("builderArtboards"). Since 2026-11-22 each side records only what it takes
// out, what it puts back at its place, and the folder moves under
// `_artboard_sheets` (into and out of `.removed versions`) — `ListsDelta`; an
// older entry's whole artboard list still applies. Validated on the way in; the
// mounted builder lends the applier.
import { parseListsDelta, type ListsDelta } from "../lib/svgBuilder/removal";

type ArtboardsApplier = (side: ListsDelta) => Promise<boolean>;
let applier: ArtboardsApplier | null = null;

export function bindArtboardsApplier(next: ArtboardsApplier): () => void {
  applier = next;
  return () => { if (applier === next) applier = null; };
}

export function applyBuilderArtboards(value: unknown): boolean | Promise<boolean> {
  const side = parseListsDelta(value);
  if (side === null || applier === null) return false;
  return applier(side);
}

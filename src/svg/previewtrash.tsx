// previewtrash.tsx — the ONE 🗑 of a versioned preview (2026-11-17, user):
// a single can in the preview's bottom-right corner that removes the version
// THAT preview shows. It replaced the can that used to sit beside every
// version chip, and it changed nothing else — the owner is still
// versionremove, the file still moves to `.removed versions`, and Undo still
// brings the version and its record back in one step.
import type { ReactNode } from "react";
import { pasteInto, type PasteSide } from "./pasteoverwrite";
import { removeVersion, type VersionKind } from "./versionremove";
import type { SvgTarget } from "./rowmodel";
import type { SvgRow } from "./types";

/**
 * The done regeneration the row shows as its AI source; null = the original.
 * The same rule as svgimgreg.mainImageOf: a pointer to no done version means
 * the original — the chips and the corner 🗑 read the ONE answer.
 */
export function mainVersionOf(meta: SvgRow["meta"]): number | null {
  const preferred = meta?.imagePreferred ?? null;
  return (meta?.imageVersions ?? []).some((v) => v.version === preferred && v.status === "done") ? preferred : null;
}

/** The SVG preview's corner 🗑 — for the version shown; none while the row shows no version. */
export function svgCorner(target: SvgTarget | null, id: string): ReactNode {
  return target !== null && target.version > 0 ? <CornerTrash id={id} kind="svg" version={target.version} /> : null;
}

/** The AI preview's corner 🗑 — for the accepted main regeneration; none while the original is main. */
export function aiCorner(meta: SvgRow["meta"], id: string): ReactNode {
  const main = mainVersionOf(meta);
  return main !== null ? <CornerTrash id={id} kind="image" version={main} /> : null;
}

/**
 * The corner cluster of one preview (2026-11-17): the 🗑 where the preview has
 * a version to remove, left of the Paste button; Paste is always rightmost.
 */
export function Corner({ id, side, trash }: { id: string; side: PasteSide; trash?: ReactNode }) {
  return <span className="pair-thumb-corner">{trash}<PasteButton id={id} side={side} /></span>;
}

/** Paste the clipboard over this preview — SVG code or a PNG image (2026-11-17). */
function PasteButton({ id, side }: { id: string; side: PasteSide }) {
  return (
    <button type="button" className="pair-thumb-paste" data-testid={`svg-paste-${side}-${id}`}
      title="Paste the clipboard over this preview — SVG code or a PNG image; the overwritten bytes park in .removed versions (Undo brings them back)"
      aria-label="Paste from the clipboard over this preview"
      onClick={(e) => { e.stopPropagation(); void pasteInto(id, side); }}
      onDoubleClick={(e) => { e.stopPropagation(); }}>📋 Paste</button>
  );
}

/** The can itself: quiet until hovered, one click removes the version this preview shows. */
function CornerTrash({ id, kind, version }: { id: string; kind: VersionKind; version: number }) {
  const what = kind === "svg" ? "SVG" : "AI source";
  return (
    <button type="button" className="pair-thumb-trash" data-testid={`svg-${kind === "svg" ? "ver" : "ai"}-trash-${id}`}
      title={`Remove ${what} v${version} from this item and its folder (moved to .removed versions; Undo brings it back)`}
      aria-label={`Remove ${what} v${version} from this item and its folder`}
      onClick={(e) => { e.stopPropagation(); void removeVersion(id, kind, version); }}
      onDoubleClick={(e) => { e.stopPropagation(); }}>🗑</button>
  );
}

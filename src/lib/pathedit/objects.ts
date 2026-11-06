// objects.ts — every path of the icon in one edit session (2026-11-06). Each
// `<path>` is an "object": its subpaths are loaded into ONE model, tagged with
// the object's number and moved into the icon's root space through the
// object's own matrix (its transforms), so anchors of different paths can be
// selected, moved and snapped together. Finish writes back only the objects
// that changed — each through the inverse matrix into its own units — and
// leaves every other path byte for byte. Pure.

import { cloneModel, IDENTITY, invertAffine, ownersOf, subsOf, toPathData, transformModel, type Affine, type PathModel } from "./model";
import { fromPathData } from "./model";
import type { EditSession } from "./session";
import { pathTags, withPathD } from "./svgdoc";

/** All paths of `source` as one model in root space; `matrices[i]` maps path i into it (identity when absent). */
export function loadObjects(source: string, matrices: readonly Affine[]): PathModel {
  const subs = pathTags(source).flatMap((tag) => transformModel(fromPathData(tag.d, tag.index), matrices[tag.index] ?? IDENTITY).subs);
  return { subs };
}

/** One object's path data in its own units. */
function objectData(model: PathModel, owner: number, m: Affine): string {
  return toPathData(transformModel(subsOf(model, owner), invertAffine(m)));
}

/** The objects whose written path would differ from the one the session started with. */
export function dirtyObjects(s: EditSession): number[] {
  const owners = [...new Set([...ownersOf(s.original), ...ownersOf(s.model)])].sort((a, b) => a - b);
  return owners.filter((o) => toPathData(subsOf(s.model, o)) !== toPathData(subsOf(s.original, o)));
}

/** The file with every changed object's `d` rewritten; null when nothing changed. */
export function writeObjects(source: string, s: EditSession, matrices: readonly Affine[]): string | null {
  const dirty = dirtyObjects(s);
  if (dirty.length === 0) return null;
  let out: string | null = source;
  for (const o of dirty) out = out === null ? null : withPathD(out, o, objectData(s.model, o, matrices[o] ?? IDENTITY));
  return out;
}

/** The d the preview shows for object `o`: the working copy when it changed, else the file's own. */
export function previewData(source: string, s: EditSession, o: number, m: Affine): string {
  const changed = toPathData(subsOf(s.model, o)) !== toPathData(subsOf(s.original, o));
  return changed ? toPathData(transformModel(subsOf(cloneModel(s.model), o), invertAffine(m)), 3) : pathTags(source)[o]?.d ?? "";
}

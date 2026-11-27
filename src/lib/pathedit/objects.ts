// objects.ts — every path of the icon in one edit session (2026-11-06). Each
// `<path>` is an "object": its subpaths are loaded into ONE model, tagged with
// the object's number and moved into the icon's root space through the
// object's own matrix (its transforms), so anchors of different paths can be
// selected, moved and snapped together. Finish writes back only the objects
// that changed — each through the inverse matrix into its own units — and
// leaves every other path byte for byte. Pure.

import { IDENTITY, invertAffine, isIdentityAffine, toPathData, transformModel, type Affine, type PathModel, type SubPath } from "./model";
import { fromPathData } from "./model";
import type { EditSession } from "./session";
import { cachedPathTags, withPathDs, type PathTag } from "./svgdoc";
import { drawOrder, orderChanged, withOrder } from "./layers";

const ownerGroupsCache = new WeakMap<PathModel, Map<number, SubPath[]>>();
const ownerDataCache = new WeakMap<PathModel, Map<number, string>>();
const dirtyListCache = new WeakMap<PathModel, WeakMap<PathModel, number[]>>();

/** Groups owned subpaths by owner index in one O(S) pass per PathModel. */
export function subsByOwner(model: PathModel): Map<number, SubPath[]> {
  const hit = ownerGroupsCache.get(model);
  if (hit !== undefined) return hit;
  const grouped = new Map<number, SubPath[]>();
  for (const s of model.subs) {
    if (s.owner === undefined) continue;
    let bucket = grouped.get(s.owner);
    if (bucket === undefined) {
      bucket = [];
      grouped.set(s.owner, bucket);
    }
    bucket.push(s);
  }
  ownerGroupsCache.set(model, grouped);
  return grouped;
}

export function sameSubRefs(a: readonly SubPath[] | undefined, b: readonly SubPath[] | undefined): boolean {
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) if (a![i] !== b![i]) return false;
  return true;
}

function ownerCanonicalData(model: PathModel, owner: number): string {
  let byOwner = ownerDataCache.get(model);
  if (byOwner === undefined) {
    byOwner = new Map();
    ownerDataCache.set(model, byOwner);
  }
  const hit = byOwner.get(owner);
  if (hit !== undefined) return hit;
  const subs = subsByOwner(model).get(owner) ?? [];
  const data = toPathData({ subs });
  byOwner.set(owner, data);
  return data;
}

/** How a path's subpaths fill and how wide their pen is in root space (its matrix scales the pen). */
function lookOf(tag: PathTag, m: Affine): Pick<SubPath, "fillRule" | "paints" | "halfStroke"> {
  const half = (tag.strokeWidth / 2) * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  return { ...(tag.fillRule === "evenodd" ? { fillRule: "evenodd" as const } : {}), ...(tag.paints ? {} : { paints: false }), ...(half > 0 ? { halfStroke: half } : {}) };
}

/** All paths of `source` as one model in root space; `matrices[i]` maps path i into it (identity when absent). */
export function loadObjects(source: string, matrices: readonly Affine[]): PathModel {
  const subs = cachedPathTags(source).flatMap((tag) => {
    const parsed = fromPathData(tag.d, tag.index);
    const m = matrices[tag.index] ?? IDENTITY;
    const moved = isIdentityAffine(m) ? parsed : transformModel(parsed, m);
    const look = lookOf(tag, m);
    return moved.subs.map((s) => ({ ...s, ...look }));
  });
  return { subs };
}

/** One object's path data in its own units. */
function objectData(model: PathModel, owner: number, m: Affine, precision?: number): string {
  const subs = subsByOwner(model).get(owner) ?? [];
  return toPathData(isIdentityAffine(m) ? { subs } : transformModel({ subs }, invertAffine(m)), precision);
}

/** The objects whose written path would differ from the one the session started with. */
export function dirtyObjects(s: EditSession): number[] {
  let byOriginal = dirtyListCache.get(s.model);
  if (byOriginal === undefined) {
    byOriginal = new WeakMap();
    dirtyListCache.set(s.model, byOriginal);
  }
  const cached = byOriginal.get(s.original);
  if (cached !== undefined) return cached;
  const cur = subsByOwner(s.model);
  const orig = subsByOwner(s.original);
  const owners = [...new Set([...orig.keys(), ...cur.keys()])].sort((a, b) => a - b);
  const dirty = owners.filter((o) => !sameSubRefs(cur.get(o), orig.get(o))
    && ownerCanonicalData(s.model, o) !== ownerCanonicalData(s.original, o));
  byOriginal.set(s.original, dirty);
  return dirty;
}

/** Fast O(1)-cached dirty check for the Finish button without serializing SVG markup. */
export function hasDirtyObjects(s: EditSession): boolean {
  return dirtyObjects(s).length > 0 || orderChanged(s.model);
}

/** The file with every changed object's `d` rewritten in a single pass; null when nothing changed. */
export function writeObjects(source: string, s: EditSession, matrices: readonly Affine[]): string | null {
  const dirty = dirtyObjects(s);
  if (dirty.length === 0 && !orderChanged(s.model)) return null;
  const tags = cachedPathTags(source);
  const ds = new Map<number, string>();
  for (const o of dirty) {
    if (tags[o] === undefined) return null;
    ds.set(o, objectData(s.model, o, matrices[o] ?? IDENTITY));
  }
  const drawn = ds.size === 0 ? source : withPathDs(source, ds);
  return withOrder(drawn, drawOrder(s.model, tags.length)); // the layer order last: slots are the drawn file's
}

/** The d the preview shows for object `o`: the working copy when it changed, else the file's own. */
export function previewData(source: string, s: EditSession, o: number, m: Affine): string {
  const cur = subsByOwner(s.model).get(o);
  const orig = subsByOwner(s.original).get(o);
  const changed = !sameSubRefs(cur, orig) && ownerCanonicalData(s.model, o) !== ownerCanonicalData(s.original, o);
  return changed ? objectData(s.model, o, m, 3) : cachedPathTags(source)[o]?.d ?? "";
}

/** Computes preview `d` ONLY for objects whose SubPath references changed since `previous`. */
export function changedPreviewData(
  tags: readonly PathTag[],
  s: EditSession,
  matrices: readonly Affine[],
  previous: PathModel | null,
): Map<number, string> {
  const out = new Map<number, string>();
  if (previous === s.model) return out;
  const cur = subsByOwner(s.model);
  const orig = subsByOwner(s.original);
  const prev = previous === null ? null : subsByOwner(previous);
  for (const t of tags) {
    const o = t.index;
    if (prev !== null && sameSubRefs(cur.get(o), prev.get(o))) continue;
    const changed = !sameSubRefs(cur.get(o), orig.get(o)) && ownerCanonicalData(s.model, o) !== ownerCanonicalData(s.original, o);
    out.set(o, changed ? objectData(s.model, o, matrices[o] ?? IDENTITY, 3) : t.d ?? "");
  }
  return out;
}

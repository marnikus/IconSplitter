// fsrelate.ts — the ONE vocabulary for what the platform proves about two folder
// handles. A browser never tells a page where a picked folder lives, but it does
// answer two identity questions: `isSameEntry(other)` (the same folder?) and
// `resolve(other)` (the segments from here down to that folder?). Everything the
// app shows as a "Full path" is built from those answers (I-63), so they are
// named here once and nowhere else.
//
// The fourth answer matters as much as the other three: `unproven` — a sibling
// tree, a handle with no `resolve`, a platform throw, an inert handle. It is
// deliberately NOT "unrelated": a missing proof must never be read as a negative
// one, and the caller's only honest move is to say it knows no path (RULE 4).

import type { DirHandleLike } from "./fs";

export type Relation =
  | { kind: "same" }
  /** `b` sits below `a`, by these segments. */
  | { kind: "below"; segments: string[] }
  /** `b` sits above `a`: these are the segments from `b` down to `a`. */
  | { kind: "above"; segments: string[] }
  /** The platform gave no proof either way. Never a claim that they differ. */
  | { kind: "unproven" };

/** What the platform proves about `a` and `b` — the same folder, or which way. */
export async function relate(a: DirHandleLike, b: DirHandleLike): Promise<Relation> {
  if (a === b || await sameEntry(a, b)) return { kind: "same" };
  const down = await segmentsFrom(a, b);
  if (down !== null) return down.length === 0 ? { kind: "same" } : { kind: "below", segments: down };
  const up = await segmentsFrom(b, a);
  if (up !== null) return up.length === 0 ? { kind: "same" } : { kind: "above", segments: up };
  return { kind: "unproven" };
}

/** `a.isSameEntry(b)` — false when the platform cannot or will not say. */
async function sameEntry(a: DirHandleLike, b: DirHandleLike): Promise<boolean> {
  const probe = a.isSameEntry;
  if (typeof probe !== "function") return false;
  try {
    return await probe.call(a, b) === true;
  } catch {
    return false; // a lost permission is not an answer, and must not hide `resolve`
  }
}

/** `parent.resolve(child)`: the segments down, or null when there is no proof. */
async function segmentsFrom(parent: DirHandleLike, child: DirHandleLike): Promise<string[] | null> {
  const resolve = parent.resolve;
  if (typeof resolve !== "function") return null;
  try {
    const answer = await resolve.call(parent, child);
    return Array.isArray(answer) && answer.every((s) => typeof s === "string") ? answer : null;
  } catch {
    return null; // NotFoundError for a foreign tree, or a denied read: no proof
  }
}

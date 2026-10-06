// pairpreferred.ts — the ONE version the row shows (I-54). Why it lives alone:
// the choice is the smallest part of the pair file and the only one with a
// fallback rule (a stale, absent or nonsense number always means "nobody
// chose"), and keeping it here leaves pairmeta.ts about identity, faces and
// history. A choice NEVER removes a version: history stays whole.

/** What a stored preference is validated against — a version number > 0. */
export interface Preferences {
  preferred: number | null;
}

/** The user's choice of the version to show, leaving the history untouched. */
export function withPreferred<T extends Preferences>(meta: T, version: number): T {
  return { ...meta, preferred: version };
}

/** A version number, or null: anything else means "no choice", never a broken file. */
export function readPreferred(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

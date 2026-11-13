// sessionorder.ts — who owns the next restart snapshot (2026-11-08).
//
// The snapshot is one localStorage document and every open page of the app can
// write it. Two pages therefore used to fight: an idle page that had been left
// with an OLD selection wrote it back on its next change, on `pagehide` or on a
// scan finishing — and the user's newer selection was gone after the reload,
// while the old 100 checks came back. The rule that fixes it: a page may write
// only over a snapshot that is not newer than its own last change.

/** A stamp this far ahead of the reader is a wrong clock, not a newer write. */
export const CLOCK_SKEW_MS = 60 * 60 * 1000;

/** An ISO stamp as epoch ms; null when it is not a usable date. */
export function stampMs(stamp: unknown): number | null {
  if (typeof stamp !== "string") return null;
  const at = Date.parse(stamp);
  return Number.isFinite(at) ? at : null;
}

/** What one page knows about its own place in the snapshot timeline. */
export interface PageWindow {
  /** When this page opened its autosave — a stamp older than this is history. */
  bootedAtMs: number;
  /** When this page last changed the store it is about to write. */
  changeAtMs: number;
  /** The stamp this page itself wrote last, or null. */
  ownStamp: string | null;
}

/**
 * True when the stored snapshot was written by ANOTHER page after this page's
 * last change, so writing now would resurrect what that page already replaced.
 * Our own last write is never foreign (a page may always update itself).
 */
export function isForeignNewerWrite(page: PageWindow, storedStamp: unknown, nowMs: number): boolean {
  if (storedStamp !== null && storedStamp === page.ownStamp) return false;
  const at = stampMs(storedStamp);
  if (at === null) return false;
  if (at <= page.bootedAtMs || at <= page.changeAtMs) return false;
  return at - nowMs <= CLOCK_SKEW_MS;
}

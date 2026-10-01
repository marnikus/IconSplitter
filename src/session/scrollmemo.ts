// scrollmemo.ts — list scroll positions (request §1 "active list and scroll
// position where practical"). Scroll events fire dozens of times a second, so
// the value is memoised and written to the session on a short debounce instead
// of re-rendering React or hammering localStorage.

import { SCROLL_SURFACES } from "../lib/session";
import { getSession, setReviewSession } from "./sessionstore";

export const SCROLL_DEBOUNCE_MS = 300;

const pending = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Remember where a list is scrolled; persisted on the debounce. */
export function setListScroll(surface: string, top: number): void {
  if (!(SCROLL_SURFACES as readonly string[]).includes(surface)) return;
  pending.set(surface, Math.max(0, Math.round(top)));
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushListScroll, SCROLL_DEBOUNCE_MS);
}

/** Stored offset for a list, so a restart lands back where the user was. */
export function getListScroll(surface: string): number {
  return getSession().review?.scroll[surface] ?? 0;
}

/** Writes every pending offset now (also the debounce callback). */
export function flushListScroll(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const review = getSession().review;
  if (!review || pending.size === 0) return;
  const scroll = { ...review.scroll };
  pending.forEach((top, key) => { scroll[key] = top; });
  pending.clear();
  setReviewSession({ ...review, scroll });
}

export function resetScrollMemoForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pending.clear();
}

// tailreview.ts — what the last "Cut tails" review found per row (2026-11-06):
// the file text it looked at and its tails. Preview only: the row draws the
// highlights while its file still has exactly that text; Approve cuts them and
// forgets the review. Nothing here is ever written to a file.

import { useSyncExternalStore } from "react";
import type { Tail } from "../../lib/tailcut";

export interface TailReview { svgPath: string; source: string; tails: Tail[] }

let reviews = new Map<string, TailReview>();
const listeners = new Set<() => void>();
const emit = () => { for (const fn of [...listeners]) fn(); };

export function setTailReviews(next: ReadonlyMap<string, TailReview>): void {
  reviews = new Map([...reviews, ...next]);
  emit();
}

export function forgetTailReviews(ids: readonly string[]): void {
  if (!ids.some((id) => reviews.has(id))) return;
  reviews = new Map([...reviews].filter(([id]) => !ids.includes(id)));
  emit();
}

export function clearTailReviews(): void { reviews = new Map(); emit(); }

// Hide / show the highlights (2026-11-06, this session): the reviews stay, only the boxes go.
let marksHidden = false;
export function getTailMarksHidden(): boolean { return marksHidden; }
export function setTailMarksHidden(hidden: boolean): void { marksHidden = hidden; emit(); }
const hiddenSnapshot = () => marksHidden;
export function useTailMarksHidden(): boolean { return useSyncExternalStore(subscribe, hiddenSnapshot); }
export function getTailReview(id: string): TailReview | null { return reviews.get(id) ?? null; }
/** The reviewed rows among `ids` that still have tails to cut. */
export function reviewedWithTails(ids: readonly string[]): string[] {
  return ids.filter((id) => (reviews.get(id)?.tails.length ?? 0) > 0);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const snapshot = () => reviews;

/** Re-renders when any review changes; read rows with getTailReview. */
export function useTailReviews(): ReadonlyMap<string, TailReview> {
  return useSyncExternalStore(subscribe, snapshot);
}

/** A row's review while its file is still exactly what was reviewed (else none: the marks would be wrong). */
export function useRowTailReview(id: string, svgPath: string, svg: string | null): TailReview | null {
  const all = useTailReviews();
  const r = all.get(id) ?? null;
  return r !== null && r.svgPath === svgPath && r.source === svg ? r : null;
}

/** A row's review and, unless hidden, its highlight boxes in the chosen colour and padding. */
export function useRowTailMarks(id: string, svgPath: string, svg: string | null, look: { color: string; paddingPx: number }) {
  const review = useRowTailReview(id, svgPath, svg);
  const hidden = useTailMarksHidden();
  const marks = review === null || hidden ? undefined : { boxes: review.tails.map((t) => t.box), color: look.color, paddingPx: look.paddingPx };
  return { review, marks };
}

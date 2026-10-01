// store.ts — remembers the last reviewed split root in IndexedDB, so a restart
// can offer the same folder again (permission is re-requested by the caller).

import { loadStored, saveStored } from "../batch/store";
import type { DirHandleLike } from "../lib/fs";

const REVIEW_ROOT_KEY = "review.root.v1";

/** Best effort: a failed store costs one re-pick, never the session. */
export async function saveReviewRoot(handle: DirHandleLike): Promise<void> {
  try {
    await saveStored(REVIEW_ROOT_KEY, handle);
  } catch {
    // ignored on purpose — the folder keeps working for this session
  }
}

export async function loadReviewRoot(): Promise<DirHandleLike | null> {
  return loadStored<DirHandleLike>(REVIEW_ROOT_KEY);
}

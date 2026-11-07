// store.ts — the builder's own remembered root, beside every other tab's slot.
// The slot name is feature-specific (`__builder__`) on purpose: the builder has
// its own folder, and inheriting another tab's handle would make the rail show a
// library the user never pointed at this tab (I-63: a name is not an identity).
//
// Reading is progressive like upload/scan's bootRoot — its own slot first, then
// the app's other roots — but only a handle whose grant is still valid is used.

import type { DirHandleLike } from "../lib/fs";
import { loadHandles, saveHandles } from "../batch/store";
import { restoreKnownRoot } from "../lib/knownroots";

export const BUILDER_HANDLE_KEY = "__builder__";

/** Remembers the folder the user picked for this tab. */
export async function rememberRoot(handle: DirHandleLike): Promise<void> {
  await saveHandles(BUILDER_HANDLE_KEY, { source: handle });
}

/** The remembered root: this tab's, else the app's newest one. Null if none. */
export async function bootRoot(): Promise<DirHandleLike | null> {
  const stored = (await loadHandles(BUILDER_HANDLE_KEY))?.source
    ?? (await loadHandles("__upload__"))?.source
    ?? (await loadHandles("__svg__"))?.source
    ?? null;
  if (stored !== null) await restoreKnownRoot(stored); // its path binds to THIS handle (I-51)
  return stored;
}

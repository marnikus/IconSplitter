// usesvgtext.ts — reading one saved SVG document for a row's preview (RULE 24).
// ONE implementation for both tabs (RULE 10): the text is stored WITH the
// identity it was read for (folder generation + path) and only that identity's
// text is handed back, so a row can never paint the document another row — or
// another folder — loaded, not even for the one frame between a rescan and the
// new read landing.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DirHandleLike } from "../lib/fs";
import { readSvgText } from "./svgfiles";

// 2026-11-06: an in-app rewrite of a file (the path editor's Finish, its undo)
// bumps that path's revision, so every preview showing it reads it again.
const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

/** The file at `relPath` was rewritten by the app: previews read it again. */
export function bumpSvgFile(relPath: string): void {
  revisions.set(relPath, (revisions.get(relPath) ?? 0) + 1);
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Text of the saved SVG at `relPath`; null while nothing is read yet. */
export function useSvgText(rootRef: { current: DirHandleLike | null }, rootToken: number, relPath: string): string | null {
  const [shown, setShown] = useState<{ key: string; file: string; text: string | null } | null>(null);
  // The file to read is (folder generation, path): a rescan has to re-read it.
  const revision = useSyncExternalStore(subscribe, () => revisions.get(relPath) ?? 0);
  const wanted = useMemo(() => ({ token: rootToken, path: relPath }), [rootToken, relPath]);
  const file = `${wanted.token}\u0000${wanted.path}`;
  const key = `${file}\u0000${revision}`;
  useEffect(() => {
    let live = true;
    const root = rootRef.current;
    if (root !== null && wanted.path !== "") {
      void readSvgText(root, wanted.path)
        .then((t) => live && setShown({ key, file, text: t }), () => live && setShown({ key, file, text: null }));
    }
    return () => { live = false; };
  }, [key, file, wanted, rootRef]);
  if (shown === null) return null;
  // Only the revision moved (the app rewrote this very file): keep the old text
  // until the new one is read — no blank frame that resizes the row (2026-11-06).
  return shown.key === key || shown.file === file ? shown.text : null;
}

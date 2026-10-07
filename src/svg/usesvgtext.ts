// usesvgtext.ts — reading one saved SVG document for a row's preview (RULE 24).
// ONE implementation for both tabs (RULE 10): the text is stored WITH the
// identity it was read for (folder generation + path) and only that identity's
// text is handed back, so a row can never paint the document another row — or
// another folder — loaded, not even for the one frame between a rescan and the
// new read landing.

import { useEffect, useMemo, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { readSvgText } from "./svgfiles";

/** Text of the saved SVG at `relPath`; null while nothing is read yet. */
export function useSvgText(rootRef: { current: DirHandleLike | null }, rootToken: number, relPath: string): string | null {
  const [shown, setShown] = useState<{ key: string; text: string | null } | null>(null);
  // The file to read is (folder generation, path): a rescan has to re-read it.
  const wanted = useMemo(() => ({ token: rootToken, path: relPath }), [rootToken, relPath]);
  const key = `${wanted.token}\u0000${wanted.path}`;
  useEffect(() => {
    let live = true;
    const root = rootRef.current;
    if (root !== null && wanted.path !== "") {
      void readSvgText(root, wanted.path)
        .then((t) => live && setShown({ key, text: t }), () => live && setShown({ key, text: null }));
    }
    return () => { live = false; };
  }, [key, wanted, rootRef]);
  return shown !== null && shown.key === key ? shown.text : null;
}

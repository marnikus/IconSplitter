// textsubset.ts — only the icon texts a picture needs (2026-11-15, performance).
// The builder keeps every loaded SVG text in one record that is replaced
// whenever ANY icon loads or changes; a picture that composes from it would
// recompose for icons it does not even show. This hook returns a record of just
// `ids`, and the SAME object for as long as those texts are the same strings,
// so the stage and each template / artboard picture recompose only for their own icons.
import { useMemo, useRef } from "react";

export function textSubset(ids: readonly string[], texts: Readonly<Record<string, string>>, prev: Readonly<Record<string, string>> | null): Readonly<Record<string, string>> {
  const next: Record<string, string> = {};
  for (const id of ids) if (texts[id] !== undefined) next[id] = texts[id];
  if (prev === null) return next;
  const keys = Object.keys(next);
  const same = keys.length === Object.keys(prev).length && keys.every((id) => prev[id] === next[id]);
  return same ? prev : next;
}

export function useTextSubset(ids: readonly string[], texts: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const last = useRef<Readonly<Record<string, string>> | null>(null);
  return useMemo(() => {
    const subset = textSubset(ids, texts, last.current);
    last.current = subset;
    return subset;
  }, [ids, texts]);
}

/**
 * Whether a picture may be composed now (2026-11-15, performance): with a folder
 * open, it waits for the scan and for its own icons' texts (an icon the library
 * does not have is never waited for), so it is composed ONCE instead of once
 * empty, once half-loaded and once complete. Without a folder it shows at once.
 */
export function pictureReady(p: { root: unknown; scanned: boolean; known: ReadonlySet<string>; booting?: boolean }, ids: readonly string[], texts: Readonly<Record<string, string>>): boolean {
  if (p.booting === true) return false; // the remembered folder is still being restored
  if (p.root === null) return true;
  if (!p.scanned) return false;
  return ids.every((id) => !p.known.has(id) || texts[id] !== undefined);
}

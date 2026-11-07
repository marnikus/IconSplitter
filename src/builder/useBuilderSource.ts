// useBuilderSource.ts — the folder side of the builder: which root this tab reads,
// how it is picked and remembered, and the walk that turns it into the library.
//
// Separated from useBuilderShell so each file owns one concern (RULE 19): this one
// knows about handles, scan tickets and the toast, and the shell only composes.

import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import type { DirHandleLike } from "../lib/fs";
import { pickFolderFor } from "../ui/pickroot";
import { bootRoot, rememberRoot, BUILDER_HANDLE_KEY } from "./store";
import { discoverBuilderIcons, type BuilderLibrary } from "./scan";

export const SCANNING = "Scanning approved SVGs…";

export { BUILDER_HANDLE_KEY };

export interface LibraryScan {
  lib: BuilderLibrary | null;
  busy: string | null;
  scan: (handle: DirHandleLike, announce: string | null) => Promise<void>;
}

/** The walk: one ticket per scan, one complete commit, a stale answer dropped. */
export function useLibraryScan(seq: MutableRefObject<number>): LibraryScan {
  const [lib, setLib] = useState<BuilderLibrary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const scan = useCallback(async (handle: DirHandleLike, announce: string | null) => {
    const ticket = ++seq.current;
    setBusy(SCANNING);
    try {
      const found = await discoverBuilderIcons(handle);
      if (seq.current !== ticket) return; // a newer scan took over
      setLib(found);
    } catch {
      if (seq.current !== ticket) return;
      setLib(null);
    } finally {
      if (seq.current === ticket) setBusy(null);
    }
    void announce;
  }, [seq]);
  return { lib, busy, scan };
}

export interface RootBinding {
  root: DirHandleLike | null;
  chooseRoot: () => void;
  rescan: () => void;
}

/** Which folder this tab reads: picked now, or the one the browser remembered. */
export function useRootBinding(
  seq: MutableRefObject<number>, scan: LibraryScan["scan"], say: (m: string) => void,
): RootBinding {
  const [root, setRoot] = useState<DirHandleLike | null>(null);
  const take = useCallback((handle: DirHandleLike | null) => {
    setRoot(handle);
    if (handle !== null) void rememberRoot(handle);
  }, []);
  const chooseRoot = useCallback(() => { void pickInto(take, say, scan); }, [take, say, scan]);
  const rescan = useCallback(() => { if (root !== null) void scan(root, null); }, [root, scan]);
  useEffect(() => {
    void restoreInto((handle) => { if (seq.current === 0) take(handle); }, scan);
  }, [seq, take, scan]);
  return { root, chooseRoot, rescan };
}

type TakeRoot = (handle: DirHandleLike | null) => void;
type Say = (message: string) => void;

/** Picks one folder, remembers it, then walks it — a cancel says so, never scans. */
async function pickInto(take: TakeRoot, say: Say, scan: LibraryScan["scan"]): Promise<void> {
  const picked = await pickFolderFor((handle) => take(handle));
  if (!picked) {
    say("Folder picking needs Chrome or Edge — or was cancelled");
    return;
  }
  await scan(picked.handle, picked.message ?? `Approved SVGs read from ${picked.handle.name}`);
}

/** Boots the remembered folder and scans it once; nothing remembered means no read. */
async function restoreInto(take: TakeRoot, scan: LibraryScan["scan"]): Promise<void> {
  const restored = await bootRoot();
  if (restored === null) return;
  take(restored);
  await scan(restored, null);
}

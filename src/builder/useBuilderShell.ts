// useBuilderShell.ts — everything the builder's shell needs before a sheet exists:
// whether the browser can read folders, the picked root, the library scan, its
// filters, and one toast. The reading is the app's own approved discovery
// (builder/scan → upload/discovery), so this hook owns no rule about what counts
// as approved: it picks, walks, and states what came back (RULE 4).
//
// A scan is versioned by a sequence number: a slower earlier scan can never
// overwrite a newer one's icons (the same guard svg/scan and upload/scan use).
//
// Split three ways so each piece is one concern: the library (walk + counts), the
// root (pick + remember + boot), and this composition.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { fsSupported } from "../batch/picker";
import type { DirHandleLike } from "../lib/fs";
import {
  emptyFilter, filterIcons, iconFacets, type BuilderFilter, type BuilderIcon,
} from "../lib/builder/rows";
import { pickFolderFor } from "../ui/pickroot";
import { bootRoot, rememberRoot, BUILDER_HANDLE_KEY } from "./store";
import { discoverBuilderIcons, type BuilderLibrary, type BuilderScope } from "./scan";
import { DEFAULT_BUILDER_CONFIG, DENSE_BUILDER_CONFIG, withGrid, type BuilderConfig } from "../lib/builder/defaults";
import { loadBuilderConfig, saveBuilderConfig } from "./configstore";
import { useAppState } from "../state/useAppState";
import { applyBuilderConfig } from "../state/apply";

export type { BuilderScope };

export interface BuilderShell {
  supported: boolean;
  /** The picked folder's name, "" when nothing is picked. */
  rootName: string;
  /** The picked folder's handle (the path row and later phases read it). */
  root: DirHandleLike | null;
  /** The last scan's counts, null until a scan commits. */
  scope: BuilderScope | null;
  /** Every icon the scan found, unfiltered. */
  icons: BuilderIcon[];
  /** What the rail shows right now. */
  visible: BuilderIcon[];
  facets: ReturnType<typeof iconFacets>;
  filter: BuilderFilter;
  setFilter: (patch: Partial<BuilderFilter>) => void;
  /** Non-null while a scan runs (its own words are the button's label). */
  busy: string | null;
  toast: string | null;
  /** The sheet design the artboard draws (P3 makes every field editable). */
  config: BuilderConfig;
  /** P3 replaces this with the approved config writer; the artboard only reads. */
  setConfig: (next: BuilderConfig) => void;
  chooseRoot: () => void;
  rescan: () => void;
  say: (message: string) => void;
}

export const SCANNING = "Scanning approved SVGs…";

export function useBuilderShell(): BuilderShell {
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((message: string) => setToast(message), []);
  const seq = useRef(0);
  const library = useLibraryScan(seq);
  const source = useRootBinding(seq, library.scan, setToast);
  const [filter, setFilter] = useFilterState();
  const icons = library.lib?.icons ?? [];
  const derived = useDerived(icons, filter);
  const [config, setConfig] = useSheetConfig();
  return {
    supported: fsSupported(),
    rootName: source.root?.name ?? "",
    root: source.root,
    scope: library.lib?.scope ?? null,
    icons,
    visible: derived.visible,
    facets: derived.facets,
    filter,
    setFilter,
    busy: library.busy,
    toast,
    config,
    setConfig,
    chooseRoot: source.chooseRoot,
    rescan: source.rescan,
    say,
  };
}

/** Filtering and faceting run once per change of the icon list or the filter. */
function useDerived(icons: BuilderIcon[], filter: BuilderFilter) {
  const visible = useMemo(() => filterIcons(icons, filter), [filter, icons]);
  const facets = useMemo(() => iconFacets(icons), [icons]);
  return { visible, facets };
}

interface LibraryScan {
  lib: BuilderLibrary | null;
  busy: string | null;
  scan: (handle: DirHandleLike, announce: string | null) => Promise<void>;
}

/** The walk: one ticket per scan, one complete commit, a stale answer dropped. */
function useLibraryScan(seq: MutableRefObject<number>): LibraryScan {
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

interface RootBinding {
  root: DirHandleLike | null;
  chooseRoot: () => void;
  rescan: () => void;
}

/** Which folder this tab reads: picked now, or the one the browser remembered. */
function useRootBinding(
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

/**
 * The sheet design: the session's copy when it has one (it always does), else the
 * stored one, else the default. Every change is written to the store (so another
 * tab's undo can see it) and to disk, and is recorded by the caller as one
 * `builderConfig` history entry.
 */
function useSheetConfig(): [BuilderConfig, (next: BuilderConfig) => void] {
  const sessionConfig = useAppState().builder.config;
  const [fallback, setFallback] = useState<BuilderConfig>(() => loadBuilderConfig());
  const config = sessionConfig ?? fallback ?? DEFAULT_BUILDER_CONFIG;
  const setConfig = useCallback((next: BuilderConfig) => {
    // ONE path for a click and for undo (RULE 12): the same apply the timeline uses.
    applyBuilderConfig(next);
    setFallback(next);
    saveBuilderConfig(next);
  }, []);
  return [config, setConfig];
}

export { DENSE_BUILDER_CONFIG, withGrid };

/** The rail's filter: one object, patched field by field. */
function useFilterState(): [BuilderFilter, (patch: Partial<BuilderFilter>) => void] {
  const [filter, setState] = useState<BuilderFilter>(emptyFilter);
  const patch = useCallback((p: Partial<BuilderFilter>) => setState((old) => ({ ...old, ...p })), []);
  return [filter, patch];
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

export { BUILDER_HANDLE_KEY };

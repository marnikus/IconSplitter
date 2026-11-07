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

import { useCallback, useMemo, useRef, useState } from "react";
import { fsSupported } from "../batch/picker";
import type { DirHandleLike } from "../lib/fs";
import {
  emptyFilter, filterIcons, iconFacets, type BuilderFilter, type BuilderIcon,
} from "../lib/builder/rows";
import type { BuilderScope } from "./scan";
import { useLibraryScan, useRootBinding, type LibraryScan, type RootBinding } from "./useBuilderSource";
import { type BuilderConfig } from "../lib/builder/defaults";
import { loadBuilderConfig, saveBuilderConfig } from "./configstore";
import { type SessionBuilderRecipe } from "../lib/session";
import { computeLayout } from "../lib/builder/layout";
import { DEFAULT_BUILDER_CONFIG } from "../lib/builder/defaults";
import { selectSlots, freshSeed, type SelectionResult } from "../lib/builder/select";
import { applyBuilderSelection, applyBuilderSeed } from "../state/apply";
import { useAppState } from "../state/useAppState";
import { applyBuilderConfig } from "../state/apply";
import type { SheetMetaArgs } from "../lib/builder/metarequest";
import type { BuilderArt } from "./useBuilderArt";

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
  /** How the sheet picks its icons, and the last selection's own report. */
  recipe: SessionBuilderRecipe;
  seed: number;
  selection: SelectionResult | null;
  setRecipe: (patch: Partial<SessionBuilderRecipe>) => void;
  setSeed: (seed: number) => void;
  /** Fills the cells from the recipe (a new seed: a genuinely new sheet). */
  reroll: () => void;
  /** Empties every cell, keeping the design and the locks' claim. */
  clear: () => void;
  chooseRoot: () => void;
  rescan: () => void;
  say: (message: string) => void;
}


/** The sheet as the metadata request sees it (P6) — one shape, built in one place. */
export function sheetArgsOf(shell: BuilderShell, art: BuilderArt): SheetMetaArgs {
  const icons = art.slots.flatMap((icon) => {
    if (icon === null) return [];
    const placed = art.placed.get(icon.id);
    // A refused icon is described as "no artwork" rather than left out: the digest
    // must not claim a cell that carries nothing.
    const box = placed !== undefined && placed.ok ? placed.box : "";
    const paths = placed !== undefined && placed.ok ? pathsIn(placed.markup) : 0;
    return [{ id: icon.id, name: icon.name, viewBox: box, paths, tags: icon.tags ?? [] }];
  });
  return {
    prompt: "", sheetSvg: "",
    icons, title: shell.config.banner.title, subtitle: shell.config.banner.subtitle,
    config: { width: shell.config.artboard.width, height: shell.config.artboard.height, columns: shell.config.grid.columns, rows: shell.config.grid.rows },
  };
}

/** How many <path> elements the artwork carries (the digest states it). */
function pathsIn(markup: string): number {
  return (markup.match(/<path/gi) ?? []).length;
}

export function useBuilderShell(): BuilderShell {
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((message: string) => setToast(message), []);
  const seq = useRef(0);
  const library = useLibraryScan(seq);
  const source = useRootBinding(seq, library.scan, setToast);
  const [filter, setFilter] = useFilterState();
  const [config, setConfig] = useSheetConfig();
  const icons = library.lib?.icons ?? [];
  const derived = useDerived(icons, filter);
  const sheet = useSheetSelection(icons, config, filter);
  return assembled({ toast, say, library, source, filter, setFilter, config, setConfig, icons, derived, sheet });
}

interface Derived {
  visible: BuilderIcon[];
  facets: ReturnType<typeof iconFacets>;
}

/** Filtering and faceting run once per change of the icon list or the filter. */
function useDerived(icons: BuilderIcon[], filter: BuilderFilter): Derived {
  const visible = useMemo(() => filterIcons(icons, filter), [filter, icons]);
  const facets = useMemo(() => iconFacets(icons), [icons]);
  return { visible, facets };
}

/** Every hook above, gathered into the one shape the screen reads. */
function assembled(a: {
  toast: string | null; say: (m: string) => void; library: LibraryScan; source: RootBinding;
  filter: BuilderFilter; setFilter: (p: Partial<BuilderFilter>) => void; config: BuilderConfig;
  setConfig: (next: BuilderConfig) => void; icons: BuilderIcon[]; derived: Derived;
  sheet: SheetSelection;
}): BuilderShell {
  return {
    ...sourceHalf(a),
    ...sheetHalf(a.sheet),
    supported: fsSupported(),
    icons: a.icons,
    visible: a.derived.visible,
    facets: a.derived.facets,
    filter: a.filter,
    setFilter: a.setFilter,
    toast: a.toast,
    config: a.config,
    setConfig: a.setConfig,
    say: a.say,
  };
}

/** The folder and scan half of the shell. */
function sourceHalf(a: { library: LibraryScan; source: RootBinding }) {
  return {
    rootName: a.source.root?.name ?? "",
    root: a.source.root,
    scope: a.library.lib?.scope ?? null,
    busy: a.library.busy,
    chooseRoot: a.source.chooseRoot,
    rescan: a.source.rescan,
  };
}

/** The selection half of the shell. */
function sheetHalf(s: SheetSelection) {
  return {
    recipe: s.recipe,
    seed: s.seed,
    selection: s.result,
    setRecipe: s.setRecipe,
    setSeed: s.setSeed,
    reroll: s.reroll,
    clear: s.clear,
  };
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



interface SheetSelection {
  recipe: SessionBuilderRecipe;
  seed: number;
  result: SelectionResult | null;
  slots: (string | null)[];
  setRecipe: (patch: Partial<SessionBuilderRecipe>) => void;
  setSeed: (seed: number) => void;
  reroll: () => void;
  clear: () => void;
}

/**
 * The selection half of the sheet. The recipe, seed and locks live in the session
 * slice (so another tab's undo can see them); the slots they produce are derived
 * here and recorded through the same `builderSelection` entry an undo would use.
 *
 * `similar` is ranked against the icon the user is looking at — the first filtered
 * icon of the rail — so the mode has a reference without inventing one.
 */
function useSheetSelection(icons: readonly BuilderIcon[], config: BuilderConfig, filter: BuilderFilter): SheetSelection {
  const session = useAppState().builder;
  const capacity = useMemo(() => computeLayout(config).capacity, [config]);
  // Cleared: the user emptied the sheet, so it stays empty until they press
  // "New sheet". Deriving a fresh selection over their clear would undo it.
  const [cleared, setCleared] = useState(false);
  const computed = useMemo(() => selectSlots(toRequest(session, icons, capacity, filter)), [session, icons, capacity, filter]);
  const result = cleared ? emptyResult(capacity) : computed;
  const setRecipe = useCallback((patch: Partial<SessionBuilderRecipe>) => {
    setCleared(false); // a recipe change asks for a sheet again
    applyBuilderSelection({ recipe: { ...session.recipe, ...patch } });
  }, [session.recipe]);
  const setSeed = useCallback((seed: number) => { setCleared(false); applyBuilderSeed({ seed }); }, []);
  const reroll = useCallback(() => { setCleared(false); applyBuilderSeed({ seed: freshSeed(Date.now()) }); }, []);
  const clear = useCallback(() => { setCleared(true); applyBuilderSelection({ slots: [], locked: [] }); }, []);
  return { recipe: session.recipe, seed: session.seed, result, slots: result.slots, setRecipe, setSeed, reroll, clear };
}

/** The session slice + the pool → the engine's request. */
function toRequest(session: ReturnType<typeof useAppState>["builder"], icons: readonly BuilderIcon[], capacity: number, filter: BuilderFilter) {
  const anchors = icons.filter((icon) => icon.id === session.slots.find((id) => id !== null));
  return {
    mode: session.recipe.mode,
    pool: icons,
    capacity,
    seed: session.seed,
    threshold: session.recipe.threshold,
    folder: session.recipe.folder,
    tag: session.recipe.tag,
    lockedIds: session.locked,
    lockedAt: lockIndex(session.slots),
    anchorTags: anchors[0]?.tags ?? fallbackAnchors(icons, filter),
    repeat: false,
    previous: session.slots,
  };
}

/** The sheet with nothing in it, and the shortfall that explains why. */
function emptyResult(capacity: number): SelectionResult {
  return { slots: Array.from({ length: capacity }, () => null), shortfall: capacity, repeated: false, staleLocks: [], basis: "none" };
}

/** id → the cell it sits in right now. */
function lockIndex(slots: readonly (string | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  slots.forEach((id, index) => { if (id !== null) out[id] = index; });
  return out;
}

/** No placed icon yet: rank against the rail's current filter, which IS the reference the user is looking at. */
function fallbackAnchors(icons: readonly BuilderIcon[], filter: BuilderFilter): string[] {
  const first = filterIcons(icons, filter)[0];
  return first?.tags ?? [];
}

/** The rail's filter: one object, patched field by field. */
function useFilterState(): [BuilderFilter, (patch: Partial<BuilderFilter>) => void] {
  const [filter, setState] = useState<BuilderFilter>(emptyFilter);
  const patch = useCallback((p: Partial<BuilderFilter>) => setState((old) => ({ ...old, ...p })), []);
  return [filter, patch];
}

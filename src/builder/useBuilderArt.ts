// useBuilderArt.ts — the artwork the artboard draws: the SVG text of every icon
// currently placed, read from the picked root and sanitised once per (path,
// fingerprint). Reads are bounded by the shared limiter, and an icon whose read or
// sanitise fails keeps its REFUSAL — a cell never silently shows nothing.
//
// P2 places the first N approved icons in cell order so the sheet is real. P4
// replaces `slotsOf` with the recipe engine; nothing else here changes.

import { useEffect, useMemo, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { createLimiter } from "../lib/limiter";
import type { BuilderIcon } from "../lib/builder/rows";
import { placeIcon, type PlaceResult } from "../lib/builder/place";
import { readSvgText } from "../svg/svgfiles";
import { computeLayout, type LayoutConfig } from "../lib/builder/layout";

/** Four reads at a time: the rail can hold hundreds of icons, disks do not like bursts. */
const READS = 4;

/**
 * Placeholder slots used before the first selection runs (and by tests): the first
 * `capacity` icons in scan order. The recipe engine in the shell is what really
 * decides a sheet — this is only what an unselected sheet shows.
 */
export function slotsOf(icons: readonly BuilderIcon[], capacity: number): (BuilderIcon | null)[] {
  return Array.from({ length: capacity }, (_, index) => icons[index] ?? null);
}

/** Cell-order ids → the icons they name (an unknown id is an honest hole). */
export function resolveSlots(chosen: readonly (string | null)[], icons: readonly BuilderIcon[]): (BuilderIcon | null)[] {
  const byId = new Map(icons.map((icon) => [icon.id, icon]));
  return chosen.map((id) => (id === null ? null : byId.get(id) ?? null));
}

/** How big the sheet may be on screen before it is scaled down to fit. */
export function zoomFor(config: LayoutConfig, maxWidth = 760): number {
  return Math.min(1, maxWidth / Math.max(1, config.artboard.width));
}

export interface BuilderArt {
  slots: (BuilderIcon | null)[];
  placed: Map<string, PlaceResult>;
  zoom: number;
}

/**
 * The sheet's cells and the sanitised artwork for them. `chosen` is the selection
 * engine's answer (icon ids per cell, null = hole); when it is empty the sheet
 * shows the first icons in scan order so an unselected sheet is still real.
 */
export function useBuilderArt(
  root: DirHandleLike | null, icons: readonly BuilderIcon[], config: LayoutConfig,
  chosen?: readonly (string | null)[],
): BuilderArt {
  const capacity = useMemo(() => computeLayout(config).capacity, [config]);
  const slots = useMemo(
    () => (chosen === undefined || chosen.length === 0 ? slotsOf(icons, capacity) : resolveSlots(chosen, icons)),
    [chosen, icons, capacity],
  );
  const [placed, setPlaced] = useState<Map<string, PlaceResult>>(new Map());
  // The key is the SET of ids still to read, not the map: a commit that only repeats
  // what is already placed would otherwise re-run the effect forever.
  const pending = useMemo(
    () => slots.filter((icon): icon is BuilderIcon => icon !== null && !placed.has(icon.id)),
    [slots, placed],
  );
  const pendingKey = pending.map((icon) => icon.id).join("|");
  useEffect(() => {
    if (root === null || pendingKey === "") return;
    void readAll(root, pending, setPlaced);
    // `pending` is derived from `pendingKey`; depending on it would loop on identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, pendingKey]);
  return { slots, placed, zoom: zoomFor(config) };
}

/** Reads and sanitises every icon not yet placed; each answer is merged, never lost. */
async function readAll(root: DirHandleLike, todo: readonly BuilderIcon[], commit: (fn: (old: Map<string, PlaceResult>) => Map<string, PlaceResult>) => void): Promise<void> {
  const limit = createLimiter(READS);
  const answers = await Promise.all(todo.map((icon) => limit(async () => ({ id: icon.id, result: await placedOf(root, icon) }))));
  if (answers.length === 0) return; // nothing read: never commit, never re-render
  commit((old) => {
    const next = new Map(old);
    for (const { id, result } of answers) next.set(id, result);
    return next;
  });
}

/** One icon: read the file, then apply the placement rules. A failed read is a refusal. */
async function placedOf(root: DirHandleLike, icon: BuilderIcon): Promise<PlaceResult> {
  const text = await readSvgText(root, icon.svgPath);
  if (text === null) return { ok: false, kind: "empty", reason: "the file could not be read" };
  return placeIcon(text);
}

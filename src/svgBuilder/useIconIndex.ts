// useIconIndex.ts — the read-only projection of the vector index: each icon's
// index state, the counts for the Icons indexing button, the Similar reference
// (locked placed icons, else the first placed icon) and the balanced score.
import { useMemo } from "react";
import { iconText, indexStateOf, type IconIndexRecord, type IndexState } from "../lib/iconIndex/record";
import { referenceOf, similarityOf, type SimilarityReference } from "../lib/iconIndex/similarity";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";

export interface IndexStats { indexed: number; pending: number; noMeta: number }

export interface IconIndexView {
  index: ReadonlyMap<string, IconIndexRecord>;
  indexStates: ReadonlyMap<string, IndexState>;
  indexStats: IndexStats;
  referenceIds: readonly string[];
  reference: SimilarityReference;
  /** 0–1 balanced similarity to the reference; null without vectors or reference. */
  scoreOf: (asset: BuilderIconAsset) => number | null;
}

const EMPTY = new Map<string, IconIndexRecord>();

export function useIconIndex(assets: readonly BuilderIconAsset[], index: ReadonlyMap<string, IconIndexRecord> | undefined,
  sheet: { placed: readonly string[]; locked: readonly string[] }): IconIndexView {
  const idx = index ?? EMPTY;
  const indexStates = useMemo(() => new Map(assets.map((a) => [a.id, indexStateOf(a, idx.get(a.id))])), [assets, idx]);
  const indexStats = useMemo(() => statsOf(assets, indexStates), [assets, indexStates]);
  const referenceIds = useMemo(() => referenceIdsOf(sheet.placed, sheet.locked), [sheet.placed, sheet.locked]);
  const reference = useMemo(() => referenceOf(referenceIds, idx), [referenceIds, idx]);
  const scoreOf = useMemo(() => (a: BuilderIconAsset) => similarityOf(reference, idx.get(a.id)?.vectors), [reference, idx]);
  return { index: idx, indexStates, indexStats, referenceIds, reference, scoreOf };
}

/** The Similar reference: locked icons on the sheet, else the first placed icon. */
export function referenceIdsOf(placed: readonly string[], locked: readonly string[]): string[] {
  const lockedPlaced = placed.filter((id) => locked.includes(id));
  return lockedPlaced.length > 0 ? lockedPlaced : placed.slice(0, 1);
}

function statsOf(assets: readonly BuilderIconAsset[], states: ReadonlyMap<string, IndexState>): IndexStats {
  let indexed = 0;
  let noMeta = 0;
  for (const a of assets) {
    if (states.get(a.id) === "ok") indexed++;
    if (iconText(a) === "") noMeta++;
  }
  return { indexed, pending: assets.length - indexed, noMeta };
}

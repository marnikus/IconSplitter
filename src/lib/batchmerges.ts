// batchmerges.ts — per-item split decisions (row merges) persisted per preset
// (RULE 13): `{"<preset>": {"<relPath lowercase>": 0…0.15 | null}}` in
// localStorage `iconSplitter.batch.merges.v1`. One corrupt entry costs that
// entry, never the store; a read never throws; the split process and the
// preview read the SAME map (I-67).

import { isRecord } from "./isrecord";

export const MERGES_KEY = "iconSplitter.batch.merges.v1";

/** relPath (lowercase) → merge fraction, `null` = auto. Same shape as `RowMergeMap`. */
export type MergeMap = Record<string, number | null>;

export const MAX_MERGE_ROWS = 500;
export const MAX_MERGE_PRESETS = 20;
const MAX_FRAC = 0.15; // the merge slider's own bound

/** One value check: `null` (auto) or a finite fraction inside the slider range. */
function clampFrac(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_FRAC) return undefined;
  return v;
}

/** One preset's map, validated entry by entry, capped at MAX_MERGE_ROWS. */
function parsePresetMap(raw: unknown): MergeMap {
  if (!isRecord(raw)) return {};
  const out: MergeMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_MERGE_ROWS) break;
    const f = clampFrac(v);
    if (!k || f === undefined) continue;
    out[k] = f;
  }
  return out;
}

/** The whole store, entry by entry, capped at MAX_MERGE_PRESETS. */
function parseMergeStore(raw: unknown): Record<string, MergeMap> {
  if (!isRecord(raw)) return {};
  const out: Record<string, MergeMap> = {};
  for (const [preset, map] of Object.entries(raw)) {
    if (!preset || Object.keys(out).length >= MAX_MERGE_PRESETS) continue;
    out[preset] = parsePresetMap(map);
  }
  return out;
}

function readStore(): Record<string, MergeMap> {
  try {
    const text = localStorage.getItem(MERGES_KEY);
    return text ? parseMergeStore(JSON.parse(text)) : {};
  } catch {
    return {}; // corrupt or blocked storage costs the decisions, never the page (RULE 13)
  }
}

/** This preset's saved decisions; unknown or corrupt → `{}`. */
export function loadRowMerges(presetName: string): MergeMap {
  return readStore()[presetName] ?? {};
}

/** Writes one preset's map; the other presets are preserved. */
export function saveRowMerges(presetName: string, map: MergeMap): void {
  if (!presetName) return;
  try {
    const all = readStore();
    const capped: MergeMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (Object.keys(capped).length >= MAX_MERGE_ROWS) break;
      capped[k] = v;
    }
    all[presetName] = capped;
    const recent = Object.entries(all).slice(-MAX_MERGE_PRESETS); // newest preset last
    localStorage.setItem(MERGES_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // A refused write keeps the in-memory map authoritative for this session.
  }
}

/** Drops one preset's map (preset deleted); the others survive. */
export function deleteRowMerges(presetName: string): void {
  try {
    const all = readStore();
    delete all[presetName];
    localStorage.setItem(MERGES_KEY, JSON.stringify(all));
  } catch {
    // Nothing readable to clean.
  }
}

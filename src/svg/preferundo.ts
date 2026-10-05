// preferundo.ts — the preferred version's cross-tab path (RULE 12, I-41).
// A preference lives in the pair's OWN file beside the images, so this module
// finds the pair file from the source index (id -> AI image path) and writes
// the choice back. A mounted Generate SVG panel binds itself here first, so a
// click and an undo both land in the same code path — exactly like svgReview.

import { loadHandles } from "../batch/store";
import { withPreference, type PairMeta } from "../lib/pairmeta";
import type { DirHandleLike } from "../lib/fs";
import { loadMetaAt, saveMetaAt } from "../selection/pairstore";
import { metaFromRecord } from "../selection/pairrecord";
import { loadSourceIndex, metaPathOfEntry, type IndexEntry } from "../state/sourceindex";
import { SVG_HANDLE_KEY } from "./reviewundo";

/** One choice a history entry carries: which version, or null for "newest". */
export interface SvgPreferRec {
  id: string;
  version: number | null;
}

export interface SvgPreferPatch {
  recs: SvgPreferRec[];
}

export type SvgPreferApplier = (patch: SvgPreferPatch) => Promise<boolean>;

let live: SvgPreferApplier | null = null;

/** A mounted Generate SVG panel claims the apply path; unmount releases it. */
export function bindSvgPreferApplier(apply: SvgPreferApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/** Apply a preference change. False means "nothing changed" — never a partial write. */
export async function applySvgPreferPatch(patch: SvgPreferPatch): Promise<boolean> {
  if (live) return live(patch);
  return applyToFiles(patch);
}

async function applyToFiles(patch: SvgPreferPatch): Promise<boolean> {
  const root = (await loadHandles(SVG_HANDLE_KEY))?.source ?? null;
  if (!root) return false;
  const index = loadSourceIndex();
  let changed = false;
  for (const rec of patch.recs) {
    const entry = index.get(rec.id);
    if (!entry) continue;
    changed = (await patchOne(root, entry, rec)) || changed;
  }
  return changed;
}

async function patchOne(root: DirHandleLike, entry: IndexEntry, rec: SvgPreferRec): Promise<boolean> {
  const relPath = metaPathOfEntry(entry);
  if (relPath === "") return false;
  const read = await loadMetaAt(root, relPath);
  const meta = read.meta ?? metaFromIndex(entry, rec);
  if (meta.preferredVersion === rec.version) return false;
  await saveMetaAt(root, relPath, withPreference(meta, rec.version));
  return true;
}

/** A pair file rebuilt from the index when the real one is gone or unreadable. */
function metaFromIndex(entry: IndexEntry, rec: SvgPreferRec): PairMeta {
  return metaFromRecord({
    pair_id: rec.id, source: null, ai_result: entry.relPath,
    decision: "pending", reviewed_at: new Date(0).toISOString(),
  });
}

export type { PairMeta };

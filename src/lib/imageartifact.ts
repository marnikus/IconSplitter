// Exact on-disk AI-source regeneration artifacts, not ordinary review sources.
// The image writer records these paths in imageVersions and mainImageOf reads
// them directly; discovery alone must not treat them as new pairs/references.
// Two rules live here, one per way a file can be somebody's history:
//   1. `<stem>_vN.png` directly inside the app's version folder (by name);
//   2. any image a pair file itself records in its `imageVersions` (by record) —
//      a registered copy living beside the pair (`fog_AI_02.png`) is that pair's
//      history too, wherever it sits, so Selection must not review it as a pair.
import { parseAiName } from "./naming";
import type { ReviewPair } from "./pairing";
import type { PairMeta } from "./pairmeta";
import type { FileEntry } from "./scan";
import { IMAGE_REGEN_DIR } from "./svgimgreg";

/** Only a direct `<canonical AI stem>_vN.png` in the app's version folder. */
export function isImageRegenArtifact(entry: Pick<FileEntry, "name" | "dirPath">, rootName: string): boolean {
  const parent = entry.dirPath === "" ? rootName : entry.dirPath.split("/").at(-1);
  if (parent?.toLowerCase() !== IMAGE_REGEN_DIR.toLowerCase()) return false;
  const match = /^(.+)_v[1-9]\d*\.png$/i.exec(entry.name);
  return match !== null && parseAiName(`${match[1]}.png`) !== null;
}

/** lower-case, forward-slashed: a folder's case is never a fact on Windows. */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/**
 * Every image a pair file records as one of ITS OWN AI-source versions:
 * lower-case path -> the id of the pair whose history holds it. Reads the record,
 * not the name, so an unnumbered copy registered in the pair's own folder is
 * covered exactly like a `_v3` in the version folder.
 */
export function recordedVariants(metas: Iterable<PairMeta>): Map<string, string> {
  const out = new Map<string, string>();
  for (const meta of metas) for (const v of meta.imageVersions) out.set(normPath(v.file), meta.id);
  return out;
}

/**
 * The pair whose history holds this image; null when nobody's. Matched on whole
 * path segments either way round, so a record written against a parent or a child
 * of the folder being scanned still finds its file — and a same-named image in a
 * different folder never does.
 */
export function variantOwner(relPath: string, index: Map<string, string>): string | null {
  const path = normPath(relPath);
  const direct = index.get(path);
  if (direct !== undefined) return direct;
  for (const [file, owner] of index) {
    if (file.endsWith(`/${path}`) || path.endsWith(`/${file}`)) return owner;
  }
  return null;
}

/**
 * The pairs a review list may show: when an image on one of their sides is
 * recorded history of a DIFFERENT pair, that pair is a phantom the registration
 * created, not artwork — it is dropped whole, so one artwork is one row. A pair
 * that records its own image as its version stays (that is the pair's own face).
 */
export function withoutRecordedVariants(pairs: readonly ReviewPair[], metas: Iterable<PairMeta>): ReviewPair[] {
  const index = recordedVariants(metas);
  if (index.size === 0) return [...pairs];
  return pairs.filter((p) => !isPhantom(p, index));
}

function isPhantom(pair: ReviewPair, index: Map<string, string>): boolean {
  return [pair.ai, pair.source].some((side) => {
    if (side === null) return false;
    const owner = variantOwner(side.relPath, index);
    return owner !== null && owner !== pair.pairId;
  });
}

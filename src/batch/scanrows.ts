// scanrows.ts — scan → display rows for the batch panel (RULE 18: keeps the
// filesystem plumbing out of useBatch). Walks the picked root, links AI
// references to their sources and projects the state file onto each row.
import { linkReferences, collectAiImages, walkTree, type AiImageEntry } from "../lib/scan";
import { readDirTree, type DirHandleLike } from "../lib/fs";
import type { Preset } from "../lib/presets";
import type { SourceStatus } from "../lib/statefile";

/** One display row: the AI image, its source status and the checkbox. */
export interface RowLike extends AiImageEntry {
  status: SourceStatus;
  selected: boolean;
}

export async function scanImages(root: DirHandleLike, preset: Preset): Promise<AiImageEntry[]> {
  const tree = await readDirTree(root, preset.ignoreFolders);
  const entries = walkTree(tree, preset.ignoreFolders);
  return linkReferences(collectAiImages(entries), entries);
}

/** Rows for a finished scan; a missing/deleted source starts unselected. */
export function rowsFor(images: readonly AiImageEntry[], statuses: Map<string, SourceStatus>): RowLike[] {
  return images.map((img) => {
    const status = statuses.get(img.relPath.toLowerCase()) ?? "unprocessed";
    return { ...img, status, selected: status !== "missing" && status !== "deleted" };
  });
}

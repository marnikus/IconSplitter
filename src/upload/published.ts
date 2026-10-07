// published.ts — the artifact the last export actually committed (CP-5): the
// JPEG is read out of the icon's own export folder. Missing means missing — the
// reader never substitutes the source SVG, a re-render, or an empty frame.

import type { DirHandleLike } from "../lib/fs";
import { publishedJpegPath } from "../lib/upload/export";
import { readBytesAt } from "./runexport";
import type { UploadRowSource } from "./discovery";

/** The committed JPEG of one pair as a Blob, or null when it is really absent. */
export async function readPublishedJpeg(root: DirHandleLike | null, source: UploadRowSource): Promise<Blob | null> {
  if (root === null) return null;
  const bytes = await readBytesAt(root, publishedJpegPath(source.dirPath, source.svgName));
  return bytes === null ? null : new Blob([bytes as BlobPart], { type: "image/jpeg" });
}

// composite.ts — builds the square contact sheet sent with a batch request
// (prompt §3/§12). Owns: reading the batch's AI images, drawing them through
// lib/svgcanvas (RULE 1), and producing the data URL + hash the provider and
// the sidecar both need. The composite lives in memory only: it is never
// written into the user's SVG output folder.

import { blobToDataUrl, loadImageFile } from "../lib/dom";
import { resolveFile } from "../selection/handles";
import { compositeLayout, type CompositeLayout } from "../lib/svgcomposite";
import { canvasToPng, hashBytes, renderComposite, type CompositeImage } from "../lib/svgcanvas";
import type { DirHandleLike } from "../lib/fs";
import type { SvgSource } from "./sources";

export interface BuiltComposite {
  dataUrl: string;
  /** Stable hash of the PNG bytes — stored in every sidecar batch reference. */
  hash: string;
  layout: CompositeLayout;
  bytes: number;
}

/** What a contact sheet needs of an image: where it is and how it looked when scanned. */
export type CompositeSource = Pick<SvgSource, "relPath" | "fingerprint">;

/**
 * Reads, decodes and draws the batch; throws when any image is unreadable or is
 * no longer the file the user reviewed (its size:mtime is not the scan's).
 */
export async function buildComposite(root: DirHandleLike, sources: readonly CompositeSource[]): Promise<BuiltComposite> {
  const layout = compositeLayout(sources.length);
  const images = await loadImages(root, sources);
  const canvas = renderComposite(layout, images);
  const blob = await canvasToPng(canvas);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, hash: hashBytes(dataUrl), layout, bytes: blob.size };
}

async function loadImages(root: DirHandleLike, sources: readonly CompositeSource[]): Promise<CompositeImage[]> {
  const out: CompositeImage[] = [];
  for (const source of sources) {
    const fh = await resolveFile(root, source.relPath);
    if (!fh) throw new Error(`source image gone: ${source.relPath}`);
    const file = await fh.getFile();
    if (`${file.size}:${file.lastModified}` !== source.fingerprint) {
      throw new Error(`${source.relPath} changed since it was scanned — rescan, then review again`);
    }
    const img = await loadImageFile(file);
    out.push({ src: img, w: img.naturalWidth, h: img.naturalHeight });
  }
  return out;
}

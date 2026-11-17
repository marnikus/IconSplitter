// artboardstore.ts — the final artboards (2026-11-13), one validated localStorage
// owner. Icon ids, banner words and sheet metadata only: no key, prompt or image
// bytes. An artboard whose template was removed is dropped on read.
import { parseArtboards, type FinalArtboard } from "../lib/svgBuilder/artboards";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_ARTBOARDS_KEY = "iconSplitter.svgBuilder.artboards.v1";

export function loadArtboards(templateIds: ReadonlySet<string>): FinalArtboard[] {
  const text = readKey(BUILDER_ARTBOARDS_KEY);
  if (!text) return [];
  try { return parseArtboards(JSON.parse(text) as unknown, templateIds); } catch { return []; }
}

export function saveArtboards(artboards: readonly FinalArtboard[]): void {
  writeKey(BUILDER_ARTBOARDS_KEY, JSON.stringify(parseArtboards(artboards)));
}

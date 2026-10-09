// exportrecord.ts — the record blocks a run assembles (split out of
// runexport.ts 2026-10-09, RULE 18): the tool blocks (EPS writer/fixes, stroke
// expansion), the JPEG block, the metadata block, and the converter deps a run
// falls back to when the caller passes none.

import { DEFAULT_BRIDGE_URL } from "../lib/upload/epsconv/bridgeconfig";
import type { ConverterDeps } from "../lib/upload/epsconv/types";
import { fmt } from "../lib/upload/geom";
import { readJpegDimensions } from "../lib/upload/jpeg";
import { metadataBlock, type ArtboardBlock, type ExportRecord } from "../lib/upload/export";
import type { PrepareResult } from "../lib/upload/prepare";
import { metadataFingerprint } from "../lib/upload/meta";
import type { UploadSettings } from "../lib/upload/settings";
import type { Artifacts } from "./exportstages";
import type { ExportRunArgs, ExportRunDeps } from "./runexport";

/** The converter deps a run falls back to: the browser's own fetch at the default helper URL. */
export function converterDeps(deps?: ExportRunDeps): ConverterDeps {
  return deps?.converter ?? { bridgeUrl: DEFAULT_BRIDGE_URL, fetch: (url, init) => globalThis.fetch(url, init) };
}

/**
 * `tools.eps`, `tools.expand` and `tools.artboard` for this run: the writer
 * that produced the EPS (kept from the previous record when this run did not
 * rebuild it), its auto-fixes, how many shapes the stroke expansion produced,
 * and the artboard the file ships (kept from the previous record when this
 * run did not prepare).
 */
export function fillToolBlocks(record: ExportRecord, art: Artifacts, settings: UploadSettings, prev: ExportRecord | null): void {
  record.tools.eps.fixes = art.epsFixes;
  record.tools.eps.writer = art.epsWriter ?? prev?.tools.eps.writer ?? record.tools.eps.writer;
  record.tools.expand = { enabled: settings.expandStrokes, shapes: art.prepared?.ok ? art.prepared.strokesExpanded : 0 };
  const artboard = artboardBlock(settings, art.prepared) ?? prev?.tools.artboard;
  if (artboard !== undefined) record.tools.artboard = artboard;
}

/** The shipped artboard: the viewBox px (3 decimals, as written), their megapixels, the passes it took. */
export function artboardBlock(settings: UploadSettings, prepared: PrepareResult | null): ArtboardBlock | null {
  if (prepared === null || !prepared.ok) return null;
  const width = Number(fmt(prepared.fit.artW));
  const height = Number(fmt(prepared.fit.artH));
  return { mode: settings.artboard.mode, width, height, megapixels: (width * height) / 1e6, scaledTo: null, passes: prepared.passes };
}

export function jpegBlock(
  art: Artifacts, quality: number, prev?: ExportRecord["jpeg"],
): ExportRecord["jpeg"] {
  const dims = art.jpegRecord ?? (art.jpeg === null ? null : readJpegDimensions(art.jpeg));
  if (dims === null) return prev ?? { width: 0, height: 0, megapixels: 0, quality, profile: "baseline" };
  return {
    width: dims.width,
    height: dims.height,
    megapixels: (dims.width * dims.height) / 1e6,
    quality,
    profile: "baseline",
  };
}

export function metadataBlockOf(args: ExportRunArgs): ExportRecord["metadata"] {
  if (args.metadata === null || args.metadataInfo === null) return null;
  return metadataBlock(args.metadata, { ...args.metadataInfo, fingerprint: metadataFingerprint(args.metadata) });
}

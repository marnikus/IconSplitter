// Probe actual embedded metadata before reusing any committed stock file.
import { sameMetadata } from "../lib/upload/rights";
import type { DirHandleLike } from "../lib/fs";
import { readTextAt, readBytesAt } from "../lib/fs";
import { readXmpMetadata } from "../lib/upload/jpeg";
import { readJpegIptc } from "../lib/upload/jpegiptc";
import { sameLegacyMetadata } from "../lib/upload/iptc";
import { readEmbeddedMetadata } from "../lib/upload/embed";
import { verifyEpsMetadata } from "../lib/upload/epsmetadata";
import type { ExportRecord } from "../lib/upload/export";
import { metadataFingerprint, type IconMetadata } from "../lib/upload/meta";

export interface MetadataOutputProbe {
  root: DirHandleLike;
  exportDir: string;
  stem: string;
  metadata: IconMetadata | null;
  recordMetadata: ExportRecord["metadata"];
  includeEps: boolean;
}

/** Whether reusable SVG/JPEG/EPS files still contain this record's accepted metadata. */
export async function metadataOutputsAt(probe: MetadataOutputProbe): Promise<{ svg: boolean; jpg: boolean; eps: boolean }> {
  const { metadata } = probe;
  if (metadata === null || probe.recordMetadata?.fingerprint !== metadataFingerprint(metadata)) return { svg: true, jpg: true, eps: true };
  const svg = await readTextAt(probe.root, `${probe.exportDir}/${probe.stem}.svg`);
  const eps = probe.includeEps ? await readTextAt(probe.root, `${probe.exportDir}/${probe.stem}.eps`) : null;
  const jpeg = await readBytesAt(probe.root, `${probe.exportDir}/${probe.stem}.jpg`);
  return {
    jpg: jpeg !== null && sameMetadata(readXmpMetadata(jpeg), metadata) && sameLegacyMetadata(readJpegIptc(jpeg), metadata),
    svg: svgHasMetadata(svg, metadata),
    eps: epsHasMetadata(eps, metadata, probe.includeEps),
  };
}

function svgHasMetadata(text: string | null, expected: IconMetadata): boolean {
  return text !== null && sameMetadata(readEmbeddedMetadata(text), expected);
}

function epsHasMetadata(text: string | null, expected: IconMetadata, includeEps: boolean): boolean {
  return !includeEps || (text !== null && verifyEpsMetadata(text, expected));
}

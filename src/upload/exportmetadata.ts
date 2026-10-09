// exportmetadata.ts — readback probe for accepted metadata in reusable outputs.
// It lets the planner repair stale SVG/EPS artifacts without re-embedding the
// JPEG, whose metadata path remains controlled by normal metadata edits.

import type { DirHandleLike } from "../lib/fs";
import { readTextAt } from "../lib/fs";
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

/** Whether reusable SVG/EPS files still contain this record's accepted metadata. */
export async function metadataOutputsAt(probe: MetadataOutputProbe): Promise<{ svg: boolean; eps: boolean }> {
  const { metadata } = probe;
  if (metadata === null || probe.recordMetadata?.fingerprint !== metadataFingerprint(metadata)) return { svg: true, eps: true };
  const svg = await readTextAt(probe.root, `${probe.exportDir}/${probe.stem}.svg`);
  const eps = probe.includeEps ? await readTextAt(probe.root, `${probe.exportDir}/${probe.stem}.eps`) : null;
  return {
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

function sameMetadata(actual: IconMetadata | null, expected: IconMetadata): boolean {
  return actual !== null && actual.title === expected.title && actual.description === expected.description
    && actual.tags.length === expected.tags.length && actual.tags.every((tag, i) => tag === expected.tags[i]);
}

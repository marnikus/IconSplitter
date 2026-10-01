// svgmanifest.ts — deterministic batching for composite SVG requests (batch
// spec §2/§5): stable order, batch-local position ids from 1, the ordered
// manifest the model must echo, and the composed prompt. No IO (RULE 1).

import { gridFor, MAX_PER_REQUEST, type GridLayout } from "./svggrid";

export interface BatchSource {
  id: string;
  name: string;
  relPath: string;
  fingerprint: string;
}

export interface BatchItem extends BatchSource {
  /** batch-local, starts at 1; never rely on list index after send */
  position: number;
}

export interface SvgBatch {
  batchId: string;
  items: BatchItem[];
  grid: GridLayout;
}

export function makeBatches(sources: BatchSource[], perRequest: number): SvgBatch[] {
  const size = perRequest >= 1 && perRequest <= MAX_PER_REQUEST ? perRequest : MAX_PER_REQUEST;
  const sorted = [...sources].sort((a, b) => cmp(a, b));
  const out: SvgBatch[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const chunk = sorted.slice(i, i + size);
    out.push({
      batchId: `b${out.length + 1}`,
      items: chunk.map((s, j) => ({ ...s, position: j + 1 })),
      grid: gridFor(chunk.length),
    });
  }
  return out;
}

function cmp(a: BatchSource, b: BatchSource): number {
  const d = a.relPath.localeCompare(b.relPath);
  return d !== 0 ? d : a.name.localeCompare(b.name);
}

export function manifestText(batch: SvgBatch): string {
  return batch.items.map((i) => `${i.position} — ${i.name}`).join("\n");
}

export function composePrompt(batch: SvgBatch, userPrompt: string): string {
  return [
    "Here is a batch of icons arranged in numbered grid order:",
    manifestText(batch),
    "",
    "Create one SVG icon for every position. Return the SVGs in the same numeric order, starting from 1.",
    "Wrap each SVG in a fenced code block labelled with its number, and use the exact same name in each SVG <title>.",
    "Empty grid cells produce no output. Do not add prose inside any SVG.",
    "",
    userPrompt,
  ].join("\n");
}

/** AI image -> versioned svg file name; versions never overwrite. */
export function svgFileName(aiName: string, version: number): string {
  return `${aiName.replace(/\.[^.]+$/, "")}.v${version}.svg`;
}

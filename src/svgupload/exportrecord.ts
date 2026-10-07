// exportrecord.ts — the record the package carries (design §5/§15). Kept apart
// from the run so the schema-shaped work has one home: the accepted metadata as
// the record's metadata block (policy id, prompt, model, tokens, cost), the
// per-output lines with their bytes and hashes, the sentence a row shows for an
// outcome, and the small helpers (a byte string for the FNV hash, the widest
// stroke in a document) the record and the plan both need.

import type { ExportRecord, MetadataRecord, OutputRecord, OutputFormat } from "../lib/svgupload/exportjson";
import { hashBytes } from "../lib/svgupload/exportjson";
import { POLICY_ID, type MetaRecord } from "../lib/svgupload/metaprompt";
import type { MetaText } from "../lib/svgupload/metapolicy";
import { packageNames } from "./package";
import { jpegTarget } from "../lib/svgupload/target";
import type { ExportPlan } from "../lib/svgupload/prepare";
import type { ExportValues } from "./exporter";

/** The accepted metadata as plain text for the two embedders. */
export function metaText(meta: MetaRecord | null): MetaText | null {
  if (meta === null || meta.status !== "accepted") return null;
  return { title: meta.title, description: meta.description, tags: meta.tags };
}

/** The record's metadata block: exactly what was accepted, with its provenance. */
export function metadataRecord(meta: MetaRecord | null): MetadataRecord | null {
  if (meta === null || meta.status !== "accepted") return null;
  return {
    policy: POLICY_ID, title: meta.title, description: meta.description, tags: meta.tags,
    prompt: meta.prompt, provider: meta.provider, model: meta.model, requestId: meta.requestId,
    tokens: meta.usage,
    cost: { actual: meta.cost.actual, estimated: meta.cost.estimated, currency: meta.cost.currency, estimatedOnly: meta.cost.actual === null },
    generatedAt: meta.at,
  };
}

export interface OutputBytes {
  svg: Uint8Array;
  jpg: Uint8Array | null;
  eps: Uint8Array | null;
}

/** One line per format actually written — bytes, hash, and the JPEG's numbers. */
export function outputRecords(base: string, plan: ExportPlan, bytes: OutputBytes, values: ExportValues): OutputRecord[] {
  const names = packageNames(base);
  const out: OutputRecord[] = [outputRecord("svg", names.svg, bytes.svg)];
  if (bytes.jpg !== null) {
    const dims = jpegTarget(values.jpeg.targetMp, plan.artboard.w / plan.artboard.h);
    out.push(outputRecord("jpg", names.jpg, bytes.jpg, { width: dims.width, height: dims.height, mp: dims.mp, quality: values.jpeg.quality }));
  }
  if (bytes.eps !== null) out.push(outputRecord("eps", names.eps, bytes.eps));
  return out;
}

/** Bytes, length and FNV hash for one output (the package writer's helper). */
function outputRecord(format: OutputFormat, path: string, bytes: Uint8Array, extra: Partial<OutputRecord> = {}): OutputRecord {
  return { format, path, bytes: bytes.length, hash: hashBytes(bytes), ...extra };
}

/** The sentence a row shows for an outcome — one line, never a raw stack. */
export function noteFor(status: ExportRecord["status"], warnings: string[], errors: string[]): string {
  if (status === "partial") return `Partial: ${warnings[0] ?? "a requested output could not be produced."}`;
  if (status === "failed") return `Failed: ${errors[0] ?? "unknown reason"}`;
  if (warnings.length > 0) return `Exported with a note: ${warnings[0]}`;
  return "Exported and verified.";
}

/** The widest specified stroke in the document, for the stroke-scale factor. */
export function widestStroke(svg: string): number | null {
  const widths = [...svg.matchAll(/stroke-width\s*[:=]\s*"?([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0);
  return widths.length === 0 ? null : Math.max(...widths);
}

export function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** A byte array as a Latin-1 string, for the FNV hash of the JPEG. */
export function latin(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

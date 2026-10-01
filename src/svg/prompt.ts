// prompt.ts — stable source IDs, ordered manifests and Requesty JSON Schema.
// Response position IDs—not array order or visual guesses—own each mapping.

import { fnv1a32 } from "../lib/pairing";
import type { SvgManifestItem } from "./types";

interface SourceForManifest {
  relativePath: string;
  filename: string;
  fingerprint: string;
}

export function stableSvgSourceId(relativePath: string): string {
  const path = relativePath.normalize("NFC").toLowerCase();
  return `svg_${encodeURIComponent(path)}_${fnv1a32(path).toString(16).padStart(8, "0")}`;
}

export function orderedManifest(sources: SourceForManifest[]): SvgManifestItem[] {
  return [...sources].sort((a, b) => compareSvgPaths(a.relativePath, b.relativePath)).map((source, index) => ({
    positionId: index + 1, sourceId: stableSvgSourceId(source.relativePath),
    filename: source.filename, relativePath: source.relativePath, fingerprint: source.fingerprint,
  }));
}

export function compareSvgPaths(leftPath: string, rightPath: string): number {
  const left = leftPath.normalize("NFC").toLowerCase();
  const right = rightPath.normalize("NFC").toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

export function batchPrompt(manifest: SvgManifestItem[], userPrompt: string): string {
  const list = manifest.map((item) => `${item.positionId} — ${item.filename}`).join("\n");
  return [
    "Batch manifest (positions are 1-based, row-major, and map to the exact source file below):",
    list,
    "Return one SVG for each listed position, and no SVG for empty grid cells.",
    "Return JSON only: {\"icons\":[{\"position_id\":1,\"title\":\"exact source filename\",\"svg\":\"complete SVG markup\"}]}.",
    "Use the exact filename as both the JSON title and the SVG <title>. Include one root <svg>, positive width and height, and a valid viewBox.",
    "Never map by appearance or shift later positions when one result is absent. Each SVG is a single icon.",
    "User SVG-quality prompt (preserve the exact text):",
    userPrompt,
  ].join("\n\n");
}

export function responseSchema(manifest: SvgManifestItem[]): Record<string, unknown> {
  const ids = manifest.map((item) => item.positionId);
  const names = manifest.map((item) => item.filename);
  return { type: "json_schema", json_schema: {
    name: "mapped_svg_icons", strict: true, schema: responseEnvelope(ids, names),
  } };
}

function responseEnvelope(ids: number[], names: string[]) {
  return {
    type: "object", additionalProperties: false,
    properties: { icons: { type: "array", items: responseIcon(ids, names) } },
    required: ["icons"],
  };
}

function responseIcon(ids: number[], names: string[]) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      position_id: { type: "integer", enum: ids },
      title: { type: "string", enum: names },
      svg: { type: "string" },
    },
    required: ["position_id", "title", "svg"],
  };
}

// optimize.ts — the SVGO wrapper for the export SVG copy (2026-10-07 clean):
// preset-default with ZERO overrides (editor metadata, comments, editor
// namespaces, unused IDs are removed by default; used IDs are minified;
// real <title>/<desc> survive, editor "Created with…" descs do not), plus
// data-* stripping (layer names SVGO keeps) and SVG version 1.1. Raster
// content (<image>) is rejected, never shipped. The record captures version,
// config, before/after size and hash. Only the export copy is optimized; the
// approved source is never touched.

import { optimize, VERSION, type Config } from "svgo";
import { sha256HexText } from "./hash";

/** The SVG version every optimized export carries. */
export const SVG_VERSION = "1.1";

export interface OptimizeRecord {
  enabled: boolean;
  version: string;
  /** The recorded config (JSON) — exactly what was passed to SVGO. */
  config: string;
  beforeBytes: number;
  afterBytes: number;
  beforeHash: string;
  afterHash: string;
}

export interface OptimizeResult {
  svg: string;
  record: OptimizeRecord;
}

/** preset-default + layer-name stripping + version 1.1. */
export const OPTIMIZE_CONFIG: Config = {
  floatPrecision: 3,
  plugins: [
    { name: "preset-default" },
    { name: "removeAttrs", params: { attrs: ["data-.*"] } },
    { name: "addAttributesToSVGElement", params: { attributes: [{ version: SVG_VERSION }] } },
  ],
};

/** Optimizes the export copy (or passes it through when disabled). */
export async function optimizeSvg(svgText: string, enabled: boolean): Promise<OptimizeResult> {
  const beforeBytes = new TextEncoder().encode(svgText).length;
  const beforeHash = await sha256HexText(svgText);
  if (!enabled) return passthrough(svgText, beforeBytes, beforeHash);
  if (hasImage(svgText)) throw new Error("raster <image> content must not ship in an export SVG");
  const cleaned = cleanSvgText(optimize(svgText, OPTIMIZE_CONFIG).data);
  return {
    svg: cleaned,
    record: {
      enabled: true, version: VERSION, config: configJson(),
      beforeBytes, afterBytes: new TextEncoder().encode(cleaned).length,
      beforeHash, afterHash: await sha256HexText(cleaned),
    },
  };
}

function passthrough(svgText: string, beforeBytes: number, beforeHash: string): OptimizeResult {
  return {
    svg: svgText,
    record: {
      enabled: false, version: VERSION, config: configJson(),
      beforeBytes, afterBytes: beforeBytes, beforeHash, afterHash: beforeHash,
    },
  };
}

/** True when the document carries an <image> element (raster content). */
function hasImage(svgText: string): boolean {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  return doc.querySelector("parsererror") === null && doc.getElementsByTagName("image").length > 0;
}

/**
 * Drops the naming SVGO keeps: any surviving data-* attribute, and every
 * `class` when no <style> remains to need it (preset inlines fill-only
 * styles; a class that survives with its <style> is load-bearing and stays).
 */
function cleanSvgText(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg") return svgText;
  const dropClass = doc.getElementsByTagName("style").length === 0;
  let changed = false;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    changed = dropDataAttrs(el) || changed;
    if (dropClass && el.hasAttribute("class")) {
      el.removeAttribute("class");
      changed = true;
    }
  }
  return changed ? new XMLSerializer().serializeToString(doc) : svgText;
}

function dropDataAttrs(el: Element): boolean {
  const doomed = Array.from(el.attributes).map((a) => a.name).filter((n) => n === "data" || n.startsWith("data-"));
  for (const name of doomed) el.removeAttribute(name);
  return doomed.length > 0;
}

function configJson(): string {
  return JSON.stringify(OPTIMIZE_CONFIG);
}

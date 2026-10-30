/// <reference types="vite/client" />
// One validator for the editor, persisted settings and actual export geometry.
import bundledBadge from "../../svg/templates/editable-stroke-width.svg?raw";
import { bakeGeometry } from "./bake";
import { cleanExportDom } from "./cleandom";
import { writeEps } from "./eps";
import type { Bounds } from "./geom/bounds";
import { identity } from "./geom/matrix";
import { insideArtboard } from "./place";
import { BADGE_SVG_NS, templateSafetyError } from "./badgetemplatesafety";

export const DEFAULT_BADGE_TEMPLATE = bundledBadge;
export const BADGE_TEMPLATE_MAX_LENGTH = 200_000;
export type TemplateResult = { ok: true; svg: string; root: Element; bounds: Bounds }
  | { ok: false; detail: string };
const refused = (detail: string): TemplateResult => ({ ok: false, detail });
const PAINT_DEFAULTS: Record<string, string> = {
  fill: "black", "fill-opacity": "1", "fill-rule": "nonzero", stroke: "none", "stroke-width": "1",
  "stroke-opacity": "1", "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "4",
  "stroke-dasharray": "none", "stroke-dashoffset": "0",
};

/** A complete self-contained vector document, canonicalized without ever entering the live DOM. */
export function validateBadgeTemplate(code: string): TemplateResult {
  if (code.trim() === "") return refused("Paste a complete SVG document with a viewBox.");
  if (code.length > BADGE_TEMPLATE_MAX_LENGTH) return refused("The SVG exceeds the 200000-character limit.");
  if (/<!DOCTYPE|<!ENTITY/i.test(code)) return refused("DTD and entity declarations are not allowed.");
  if (/<\?(?!xml(?:\s|\?>))/i.test(code)) return refused("SVG processing instructions and external stylesheets are not allowed.");
  const root = parseTemplateRoot(code);
  if (root === null) return refused("The code must be valid SVG XML.");
  const error = templateSafetyError(root);
  if (error !== null) return refused(error);
  const bounds = templateViewBox(root);
  if (bounds === null) return refused("The SVG needs a finite viewBox with positive width and height.");
  return canonicalTemplate(root, bounds);
}

/** Missing xmlns is common in pasted snippets; normalize it before checking descendants. */
function parseTemplateRoot(code: string): Element | null {
  const doc = new DOMParser().parseFromString(code, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") !== null || root?.nodeName !== "svg") return null;
  if (root.namespaceURI !== null) return root;
  root.setAttribute("xmlns", BADGE_SVG_NS);
  return new DOMParser().parseFromString(new XMLSerializer().serializeToString(root), "image/svg+xml").documentElement;
}

function templateViewBox(root: Element): Bounds | null {
  const nums = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || !nums.every(Number.isFinite) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { minX: nums[0], minY: nums[1], width: nums[2], height: nums[3] };
}

function canonicalTemplate(root: Element, bounds: Bounds): TemplateResult {
  cleanExportDom(root, { keepRootEmbeds: false });
  for (const [name, value] of Object.entries(PAINT_DEFAULTS)) {
    if (!root.hasAttribute(name)) root.setAttribute(name, value);
  }
  const baked = bakeGeometry(root, identity());
  if (baked.unsupported.length > 0) return refused(`Unsupported SVG geometry: ${baked.unsupported.join(", ")}.`);
  if (!insideArtboard(root)) return refused("The SVG must contain visible vector geometry entirely inside its viewBox (including strokes).");
  const svg = new XMLSerializer().serializeToString(root);
  const eps = writeEps(svg, "#ffffff");
  if (!eps.ok) return refused(`Unsupported vector SVG: ${eps.reason}.`);
  return { ok: true, svg, root, bounds };
}

/** Invalid persisted data costs only this field; empty is the explicit bundled-template choice. */
export function readBadgeTemplate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "") return "";
  const result = validateBadgeTemplate(value);
  return result.ok ? result.svg : null;
}

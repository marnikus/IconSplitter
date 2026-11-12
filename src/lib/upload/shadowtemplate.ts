/// <reference types="vite/client" />
// shadowtemplate.ts — the user-editable SHADOW template of the Upload tab (2026-11-08), set the
// same way as the badge's "Edit SVG template…": any complete vector SVG with a viewBox, validated
// before it is stored or drawn, with the bundled graphic as the default (the empty setting).
//
// It is the badge's validator on purpose (`validateBadgeTemplate`): paths, basic shapes, groups
// and linear/radial gradients are kept, the geometry must lie inside the viewBox and the built-in
// EPS writer must be able to write it, so a template that passes here exports as SVG, JPEG and EPS.
// Text, images, scripts, external resources and unsupported effects are refused, never half-applied.

import bundledShadow from "../../svg/templates/shadow.svg?raw";
import { BADGE_TEMPLATE_MAX_LENGTH, validateBadgeTemplate, type TemplateResult } from "./badgetemplate";

export const DEFAULT_SHADOW_TEMPLATE = bundledShadow;
export const SHADOW_TEMPLATE_MAX_LENGTH = BADGE_TEMPLATE_MAX_LENGTH;
export type ShadowTemplateResult = TemplateResult;

/**
 * A shadow template as pasted → the canonical vector document, its viewBox and its root, or why not.
 * The bundled graphic is always valid: it is drawn by its own ellipse path (its user-space gradient is
 * normalized there), which the general bake would refuse.
 */
export function validateShadowTemplate(code: string): ShadowTemplateResult {
  return code.trim() === DEFAULT_SHADOW_TEMPLATE.trim() ? bundledResult() : validateBadgeTemplate(code);
}

function bundledResult(): ShadowTemplateResult {
  const root = new DOMParser().parseFromString(DEFAULT_SHADOW_TEMPLATE, "image/svg+xml").documentElement;
  return { ok: true, svg: DEFAULT_SHADOW_TEMPLATE.trim(), root, bounds: { minX: 0, minY: 0, width: 204, height: 24 } };
}

const parsed = new Map<string, ShadowTemplateResult>();
/** The validated template for a custom setting value, remembered per string: every placement pass asks. */
export function shadowTemplateOf(code: string): ShadowTemplateResult {
  let result = parsed.get(code);
  if (result === undefined) {
    result = validateShadowTemplate(code);
    if (parsed.size >= 16) parsed.clear();
    parsed.set(code, result);
  }
  return result;
}

let defaultCanonical: string | null = null;
/** Persisted data costs only this field: `""` = the bundled graphic; valid code is stored canonical; anything else → null. */
export function readShadowTemplateSetting(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "") return "";
  const result = validateShadowTemplate(value);
  if (!result.ok) return null;
  if (defaultCanonical === null) {
    const base = validateShadowTemplate(DEFAULT_SHADOW_TEMPLATE);
    defaultCanonical = base.ok ? base.svg : "";
  }
  return result.svg === defaultCanonical ? "" : result.svg;
}

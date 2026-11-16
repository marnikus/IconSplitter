// customshadow.ts — a user's shadow template placed under the icon (2026-11-08). The template is any
// validated vector SVG; it is copied exactly the way the corner badge's template is: baked by one
// uniform matrix into a rectangle (no transform reaches the file), its ids isolated, its gradients
// and paint kept. The rectangle is the shadow's size and place: `widthPct` of the shipped icon's
// width (the template's viewBox proportions preserved), centred on the icon, `gapPct` of the
// icon's height below its bottom edge. It goes BEHIND the icon, and the artboard fit measures it.

import type { Bounds } from "./geom/bounds";
import { fmt } from "./geom";
import { buildCopy, isolateIds } from "./sizeguidecopy";
import { shadowTemplateOf } from "./shadowtemplate";

/** What the placement asks of a custom shadow. */
export interface CustomShadowSpec { widthPct: number; gapPct: number; templateSvg: string; expand?: boolean }

/** The user's template as a group behind the icon, or null when it (or the icon bounds) cannot be placed. */
export function appendCustomShadow(root: Element, icon: Bounds, spec: CustomShadowSpec): Element | null {
  const template = shadowTemplateOf(spec.templateSvg);
  const width = icon.width * spec.widthPct / 100;
  if (!template.ok || !(width > 0) || !(icon.height > 0) || !Number.isFinite(spec.gapPct)) return null;
  const height = width * template.bounds.height / template.bounds.width;
  if (Number(fmt(width)) <= 0 || Number(fmt(height)) <= 0) return null;
  const rect = {
    minX: icon.minX + (icon.width - width) / 2,
    minY: icon.minY + icon.height + icon.height * spec.gapPct / 100,
    width, height,
  };
  const copy = buildCopy(root, template.root, { bounds: template.bounds, rect, color: null, strokeWidthPx: null, expand: spec.expand === true });
  if (!copy.ok) return null;
  isolateIds(copy.group, new Set(Array.from(root.querySelectorAll("[id]")).map((el) => el.id)));
  root.insertBefore(copy.group, root.firstChild);
  return copy.group;
}

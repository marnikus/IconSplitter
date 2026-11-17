// artboardview.ts — which final artboards the list shows (2026-11-13): those of
// the CHECKED templates, else of the active template; grouped in template order.
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import type { SheetTemplate } from "../lib/svgBuilder/templates";
import type { BuilderModel } from "./model";

export interface ArtboardGroup { template: SheetTemplate; artboards: FinalArtboard[] }

type View = Pick<BuilderModel, "templates" | "templateSel" | "artboards">;

export function shownTemplateIds(m: View): string[] {
  if (m.templateSel.checked.length > 0) return m.templates.filter((t) => m.templateSel.checked.includes(t.id)).map((t) => t.id);
  return m.templateSel.active !== null && m.templates.some((t) => t.id === m.templateSel.active) ? [m.templateSel.active] : [];
}

export function artboardGroups(m: View): ArtboardGroup[] {
  const shown = new Set(shownTemplateIds(m));
  return m.templates.filter((t) => shown.has(t.id)).map((template) => ({
    template, artboards: m.artboards.filter((a) => a.templateId === template.id),
  }));
}

/** The visible order the gestures (Shift range, arrows, header checkbox) use. */
export function visibleArtboards(m: View): FinalArtboard[] {
  return artboardGroups(m).flatMap((g) => g.artboards);
}

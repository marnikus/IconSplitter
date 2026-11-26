// artboardview.ts — which final artboards the list shows (2026-11-13): those of
// the CHECKED templates, else of the active template; grouped in template order.
import { checkedInView } from "../lib/reviewselect";
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

type StageView = Pick<BuilderModel, "editingTemplateId" | "editingArtboardId" | "artboards">;

/** The template the stage works on now (the edited one, else the open artboard's), if any. */
export function stageTemplateId(m: StageView): string | null {
  return m.editingTemplateId ?? m.artboards.find((a) => a.id === m.editingArtboardId)?.templateId ?? null;
}

/**
 * Every artboard a picture is drawn for (2026-11-26): the list's and the stage
 * strip's. A folder change empties the loaded icon texts and only these are read
 * again — a strip thumbnail missing here waited for its icons forever.
 */
export function previewedArtboards(m: View & StageView): FinalArtboard[] {
  const shown = visibleArtboards(m);
  const stage = stageTemplateId(m);
  const listed = new Set(shown.map((a) => a.id));
  return [...shown, ...m.artboards.filter((a) => a.templateId === stage && !listed.has(a.id))];
}

/**
 * What ✕ Remove in the Saved templates header takes (2026-11-22): the checked
 * templates (each with every artboard of it), else the checked artboards in view.
 */
export function removalScope(m: View & Pick<BuilderModel, "artboardSel">): { kind: "templates" | "artboards"; ids: string[] } {
  const templates = m.templates.filter((t) => m.templateSel.checked.includes(t.id)).map((t) => t.id);
  if (templates.length > 0) return { kind: "templates", ids: templates };
  return { kind: "artboards", ids: checkedInView(visibleArtboards(m).map((a) => a.id), m.artboardSel.checked) };
}

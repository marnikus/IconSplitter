// stagenav.ts — quick walking on the stage (2026-11-23): which template ◀ ▶
// (and ← →) open next, and which artboard ↑ ↓ open within the template being
// worked on. No wrapping: at an end there is nothing to open. Pure.
import type { BuilderModel } from "./model";

type View = Pick<BuilderModel, "templates" | "artboards" | "editingTemplateId" | "editingArtboardId" | "templateSel">;
export type Step = -1 | 1;

/** The template the stage works on: the open artboard's, else the edited one, else the selected one. */
export function currentTemplateId(m: View): string | null {
  const open = m.artboards.find((a) => a.id === m.editingArtboardId);
  const id = open?.templateId ?? m.editingTemplateId ?? m.templateSel.active;
  return id !== null && m.templates.some((t) => t.id === id) ? id : null;
}

/** The template `by` steps from the current one in the Saved templates order (the first when none is current); null at an end. */
export function steppedTemplate(m: View, by: Step): string | null {
  const current = currentTemplateId(m);
  if (current === null) return m.templates[0]?.id ?? null;
  const at = m.templates.findIndex((t) => t.id === current);
  return m.templates[at + by]?.id ?? null;
}

/** The artboard `by` steps from the open one within its template; from the template itself ↓ opens the first, ↑ the last. */
export function steppedArtboard(m: View, by: Step): string | null {
  const templateId = currentTemplateId(m);
  const mine = m.artboards.filter((a) => a.templateId === templateId);
  const at = mine.findIndex((a) => a.id === m.editingArtboardId);
  if (at < 0) return (by === 1 ? mine[0] : mine[mine.length - 1])?.id ?? null;
  return mine[at + by]?.id ?? null;
}

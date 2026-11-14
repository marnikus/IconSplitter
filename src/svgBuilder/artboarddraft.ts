// artboarddraft.ts — an open final artboard's unsaved edits (2026-11-14). Like a
// template, an artboard is no longer written back on every edit: the stage is
// its draft until ✓ Save artboard (or Save in the leave question); ↺ Reset or
// Discard drops it. "Changed" ignores key order and how empty cells are named,
// so merely opening an artboard is never a change.
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import { overridesOf } from "../lib/svgBuilder/lookoverrides";
import { isEmptySlot } from "../lib/svgBuilder/slots";
import type { BuilderModel } from "./model";

type View = Pick<BuilderModel, "config" | "templates" | "lockedIds" | "metadata" | "artboards" | "editingArtboardId">;

/** The artboard open on the stage, if any. */
export function openArtboardOf(m: Pick<BuilderModel, "artboards" | "editingArtboardId">): FinalArtboard | null {
  return m.artboards.find((a) => a.id === m.editingArtboardId) ?? null;
}

/** The artboard as the stage shows it now; look settings that differ from its template become its own. */
export function artboardFromStage(a: FinalArtboard, m: View, placedIds: readonly string[]): FinalArtboard {
  const banner = m.config.banner;
  const template = m.templates.find((t) => t.id === a.templateId);
  return {
    ...a, title: banner.title, subtitle: banner.subtitle, heroIconId: banner.heroIconId,
    placedIds: [...placedIds], lockedIds: [...m.lockedIds], metadata: m.metadata, captionTexts: { ...banner.captionTexts },
    overrides: template === undefined ? a.overrides : overridesOf(template, m.config),
  };
}

/** JSON with sorted keys, so two equal records always read the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((k) => record[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Cells as they look: every empty cell alike, trailing empty cells dropped. */
function cellsOf(ids: readonly string[]): string[] {
  const out = ids.map((id) => (isEmptySlot(id) ? "" : id));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

const comparable = (a: FinalArtboard) => stable({ ...a, placedIds: cellsOf(a.placedIds), updated: "" });

/** True when the open artboard's stage differs from what is saved. */
export function artboardChanged(m: View, placedIds: readonly string[]): boolean {
  const open = openArtboardOf(m);
  return open !== null && comparable(open) !== comparable(artboardFromStage(open, m, placedIds));
}

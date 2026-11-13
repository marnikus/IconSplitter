// templatestore.ts — the saved sheet templates (2026-11-13), one validated
// localStorage owner. Only the sheet's look is stored: no icon, key, prompt or
// image bytes, and no banner words (lib/svgBuilder/templates.ts `lookOf`).
import { parseTemplates, type SheetTemplate } from "../lib/svgBuilder/templates";
import { readKey, writeKey } from "../state/safestorage";

export const BUILDER_TEMPLATES_KEY = "iconSplitter.svgBuilder.templates.v1";

export function loadTemplates(): SheetTemplate[] {
  const text = readKey(BUILDER_TEMPLATES_KEY);
  if (!text) return [];
  try { return parseTemplates(JSON.parse(text) as unknown); } catch { return []; }
}

export function saveTemplates(templates: readonly SheetTemplate[]): void {
  writeKey(BUILDER_TEMPLATES_KEY, JSON.stringify(parseTemplates(templates)));
}

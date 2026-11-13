// artboards.ts — final artboards of a saved template (2026-11-13). A template is
// the blueprint (look + grid only). A final artboard is one sheet built from it:
// its own icons, its own banner words and hero, and its own sheet metadata. It
// always draws with its template's CURRENT look, so editing a template restyles
// its artboards. Pure: validation on read (RULE 13), names, config and preview.
import { isRecord } from "../isrecord";
import { applyCopy } from "./config";
import { cleanSheetMetadata, sheetMetadataFingerprint, validateSheetMetadata } from "./metadata";
import { isEmptySlot } from "./slots";
import { sheetPreviewSvg, type SheetTemplate } from "./templates";
import type { BuilderIconAsset, SheetConfig, SheetMetadata } from "./types";

export const ARTBOARD_LIMIT = 400;

export interface FinalArtboard {
  id: string;
  templateId: string;
  name: string;
  title: string;
  subtitle: string;
  heroIconId: string | null;
  /** Cell order; `~empty:N` holes kept. */
  placedIds: string[];
  lockedIds: string[];
  metadata: SheetMetadata | null;
  created: string;
  updated: string;
  /** When it was last exported; null = not exported yet (its icons count as pending use). */
  exportedAt: string | null;
  /** Icons whose usage this artboard already added (counted once, on its first export). */
  countedIds: string[];
}

/** "Side banner · 8×4 · Solid — #3": the template's name and the next free number. */
export function artboardName(template: SheetTemplate, artboards: readonly FinalArtboard[]): string {
  const taken = new Set(artboards.map((a) => a.name.toLowerCase()));
  for (let n = artboards.filter((a) => a.templateId === template.id).length + 1; ; n += 1) {
    const name = `${template.name} — #${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function newArtboard(template: SheetTemplate, artboards: readonly FinalArtboard[], now: string, id: string): FinalArtboard {
  return {
    id, templateId: template.id, name: artboardName(template, artboards), title: "", subtitle: "", heroIconId: null,
    placedIds: [], lockedIds: [], metadata: null, created: now, updated: now, exportedAt: null, countedIds: [],
  };
}

/** The sheet an artboard draws: its template's look with the artboard's own words and hero. */
export function artboardConfig(template: SheetTemplate, artboard: FinalArtboard): SheetConfig {
  return applyCopy(template.config, { ...template.config, banner: { ...template.config.banner, title: artboard.title, subtitle: artboard.subtitle, heroIconId: artboard.heroIconId } });
}

export function artboardPreviewSvg(args: {
  template: SheetTemplate; artboard: FinalArtboard; assets: readonly BuilderIconAsset[]; svgTexts: Readonly<Record<string, string>>;
}): string {
  // The artboard's own words, never the template's sample text.
  return sheetPreviewSvg({
    config: artboardConfig(args.template, args.artboard),
    assets: args.assets, placedIds: args.artboard.placedIds, svgTexts: args.svgTexts,
  });
}

/** Real icons on the artboard, in cell order. */
export function artboardIcons(artboard: FinalArtboard): string[] {
  return artboard.placedIds.filter((id) => !isEmptySlot(id));
}

/**
 * Icons on artboards whose use is not saved yet — not exported, or added after
 * the last export — counted per icon: the "pending" use. Removing an icon from an
 * artboard takes it off; exporting the artboard turns it into saved use.
 */
export function pendingUse(artboards: readonly FinalArtboard[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of artboards) {
    const counted = new Set(a.countedIds);
    for (const id of new Set(artboardIcons(a))) if (!counted.has(id)) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

const strings = (raw: unknown, max: number): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, max) : [];
const text = (raw: unknown, max: number) => (typeof raw === "string" ? raw.slice(0, max) : "");

function parseMetadata(raw: unknown): SheetMetadata | null {
  if (!isRecord(raw)) return null;
  const fields = cleanSheetMetadata(raw);
  const state = raw.state === "accepted" ? "accepted" : raw.state === "invalid" ? "invalid" : "draft";
  return { ...fields, state, validation: validateSheetMetadata(fields), fingerprint: sheetMetadataFingerprint(fields) };
}

/** The id, template and name every artboard needs; null when any is missing or the template is gone. */
function keyOf(raw: unknown, templateIds: ReadonlySet<string> | null): { raw: Record<string, unknown>; id: string; templateId: string; name: string } | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || typeof raw.templateId !== "string") return null;
  if (templateIds !== null && !templateIds.has(raw.templateId)) return null;
  const name = text(raw.name, 80).trim();
  return name === "" ? null : { raw, id: raw.id, templateId: raw.templateId, name };
}

function parseArtboard(input: unknown, templateIds: ReadonlySet<string> | null): FinalArtboard | null {
  const key = keyOf(input, templateIds);
  if (key === null) return null;
  const { raw, name } = key;
  return {
    id: key.id.slice(0, 80), templateId: key.templateId, name, title: text(raw.title, 90), subtitle: text(raw.subtitle, 140),
    heroIconId: typeof raw.heroIconId === "string" && raw.heroIconId !== "" ? raw.heroIconId : null,
    placedIds: strings(raw.placedIds, 192), lockedIds: strings(raw.lockedIds, 192), metadata: parseMetadata(raw.metadata),
    created: text(raw.created, 40), updated: text(raw.updated, 40),
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null, countedIds: strings(raw.countedIds, 192),
  };
}

/** The saved list: junk drops, duplicate ids keep the first, an artboard of a removed template drops. */
export function parseArtboards(raw: unknown, templateIds: ReadonlySet<string> | null = null): FinalArtboard[] {
  if (!Array.isArray(raw)) return [];
  const out: FinalArtboard[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    const a = parseArtboard(entry, templateIds);
    if (a === null || ids.has(a.id)) continue;
    ids.add(a.id);
    out.push(a);
    if (out.length >= ARTBOARD_LIMIT) break;
  }
  return out;
}

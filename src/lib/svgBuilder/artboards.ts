// artboards.ts — final artboards of a saved template (2026-11-13). A template is
// the blueprint (look + grid only). A final artboard is one sheet built from it:
// its own icons, its own banner words and hero, and its own sheet metadata. It
// always draws with its template's CURRENT look, so editing a template restyles
// its artboards. Pure: validation on read (RULE 13), names, config and preview.
import { isRecord } from "../isrecord";
import { applyCopy, parseCaptionTexts } from "./config";
import { DEFAULT_ARTBOARD_SUBTITLE, cleanSheetMetadata, sheetMetadataFingerprint, validateSheetMetadata } from "./metadata";
import { emptySlotFor, isEmptySlot } from "./slots";
import { lookOf, sheetFolderOf, sheetPreviewSvg, type SheetTemplate } from "./templates";
import { parseOverrides, withOverrides, type LookOverrides } from "./lookoverrides";
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
  /** Look settings changed on this artboard (2026-11-14): they win over the template; the rest is inherited. */
  overrides: LookOverrides;
  /** Captions typed on this artboard, by icon id (2026-11-14); never the template's, never the icon's metadata. */
  captionTexts: Record<string, string>;
  /** Its `artboard_variant_N` folder under `_artboard_sheets` once saved there (2026-11-14, sheetfolders.ts); null before. */
  folder: string | null;
}

/** "Side banner · 8×4 · Solid — #3": the template's name and the next free number. */
export function artboardName(template: SheetTemplate, artboards: readonly FinalArtboard[]): string {
  const taken = new Set(artboards.map((a) => a.name.toLowerCase()));
  for (let n = artboards.filter((a) => a.templateId === template.id).length + 1; ; n += 1) {
    const name = `${template.name} — #${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/**
 * A new final artboard (2026-11-14): it starts with the template's SAMPLE words
 * (never blank) and the given start icons (the caller's pick), so it is a real
 * sheet at once — every word and icon stays editable.
 */
export function newArtboard(template: SheetTemplate, artboards: readonly FinalArtboard[], at: { now: string; id: string; placedIds?: readonly string[] }): FinalArtboard {
  const { title, subtitle } = lookOf(template.config).banner;
  return {
    id: at.id, templateId: template.id, name: artboardName(template, artboards), title, subtitle, heroIconId: null,
    placedIds: [...(at.placedIds ?? [])], lockedIds: [], metadata: null, created: at.now, updated: at.now, exportedAt: null, countedIds: [], overrides: {}, captionTexts: {}, folder: null,
  };
}

/**
 * A generated metadata answer on an artboard (2026-11-14): its metadata, and
 * its VISIBLE words — Title-Artboard as the banner title (kept when the answer
 * had none) and the default subtitle phrase.
 */
export function withSheetAnswer(artboard: FinalArtboard, answer: { metadata: SheetMetadata; artboardTitle: string }): FinalArtboard {
  return { ...artboard, metadata: answer.metadata, ...(answer.artboardTitle === "" ? {} : { title: answer.artboardTitle, subtitle: DEFAULT_ARTBOARD_SUBTITLE }) };
}

/** One artboard without the icons `known` does not have; the same object when nothing changes. */
function artboardWithout(a: FinalArtboard, known: ReadonlySet<string>): FinalArtboard {
  const gone = (id: string) => !isEmptySlot(id) && !known.has(id);
  if (!a.placedIds.some(gone) && !a.lockedIds.some(gone) && !(a.heroIconId !== null && gone(a.heroIconId))) return a;
  const placedIds: string[] = [];
  for (const id of a.placedIds) placedIds.push(gone(id) ? emptySlotFor([...a.placedIds, ...placedIds]) : id);
  return { ...a, placedIds, lockedIds: a.lockedIds.filter((id) => !gone(id)), heroIconId: a.heroIconId !== null && gone(a.heroIconId) ? null : a.heroIconId };
}

/**
 * Icons the library no longer has (declined, removed, no longer approved) leave
 * every artboard (2026-11-14): their cells stay, empty, so nothing shifts.
 */
export function artboardsWithout(artboards: readonly FinalArtboard[], known: ReadonlySet<string>): FinalArtboard[] {
  return artboards.map((a) => artboardWithout(a, known));
}

/** The sheet an artboard draws: its template's look, its own look changes on top, its own words and hero. */
export function artboardConfig(template: SheetTemplate, artboard: FinalArtboard): SheetConfig {
  const look = withOverrides(template.config, artboard.overrides);
  return applyCopy(look, { ...look, banner: { ...look.banner, title: artboard.title, subtitle: artboard.subtitle, heroIconId: artboard.heroIconId, captionTexts: artboard.captionTexts } });
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
    overrides: parseOverrides(raw.overrides), captionTexts: parseCaptionTexts(raw.captionTexts),
    folder: sheetFolderOf(raw.folder),
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

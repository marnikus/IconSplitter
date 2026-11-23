// sheetsync.ts — the builder's JSON files and the app, kept in step (2026-11-22).
// Pure. The app fingerprints every template.json / sheet.json / metadata.json it
// writes or reads (`sigOf`), so a file changed OUTSIDE the app is told apart
// from the app's own copy — an older one, or the open artboard's live draft —
// which is never read back (`fileState`). An edited file is read onto its
// template (the look) or artboard (words, icons, locks, look changes, metadata).
import { isRecord } from "../isrecord";
import { fnv1a32 } from "../pairing";
import { artboardConfig, type FinalArtboard } from "./artboards";
import { overridesOf } from "./lookoverrides";
import { cleanSheetMetadata, editSheetMetadata, emptySheetMetadata } from "./metadata";
import { presetJsonOf, readPresetJson } from "./presetjson";
import { isEmptySlot } from "./slots";
import { lookOf, type SheetTemplate } from "./templates";
import type { BuilderIconAsset, SelectionRecipe, SheetConfig, SheetMetadata } from "./types";

export type FileState = "missing" | "ours" | "edited" | "legacy";
export type SyncAction = "keep" | "adopt" | "write" | "backup-write";

/** A file's fingerprint: its length and FNV-1a hash. */
export function sigOf(text: string): string {
  return `${text.length}:${fnv1a32(text).toString(16)}`;
}

/** Missing; the app's own (its fingerprint); changed outside the app; or from before fingerprints (no record). */
export function fileState(text: string | null, known: string | undefined): FileState {
  if (text === null) return "missing";
  if (known === undefined) return "legacy";
  return sigOf(text) === known ? "ours" : "edited";
}

const SIG = /^\d+:[0-9a-f]{1,8}$/;

/** Stored fingerprints, field by field: sheet-folder paths and well-formed values only (RULE 13). */
export function parseFileSigs(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [path, sig] of Object.entries(raw)) {
    if (path.startsWith("_artboard_sheets/") && !path.split("/").includes("..") && typeof sig === "string" && SIG.test(sig)) out[path] = sig;
  }
  return out;
}

/**
 * What the app does with one of its files: an outside edit waits for Register;
 * a file saying what the app holds is kept (adopted when it had no fingerprint);
 * a missing file or the app's own older copy is rewritten; a differing file from
 * before fingerprints is backed up and replaced when known to be stale, else kept.
 */
export function syncDecision(state: FileState, same: boolean, legacyStale: boolean): SyncAction {
  if (state === "edited") return "keep";
  if (same) return state === "legacy" ? "adopt" : "keep";
  if (state !== "legacy") return "write";
  return legacyStale ? "backup-write" : "keep";
}

/** Older than the template's last save (2 s for the disk's clock steps): a copy written before it. */
export function olderThanSave(modified: number, saved: string): boolean {
  const at = Date.parse(saved);
  return Number.isFinite(at) && modified < at - 2000;
}

/** template.json's look, merged onto the template (a field left out keeps its value); null when unreadable. */
export function templateLookFromFile(template: SheetTemplate, text: string): SheetConfig | null {
  const read = readPresetJson(text, template.config, []);
  return read.ok ? lookOf(read.preset.config) : null;
}

/** Two looks the same, the way templates are compared. */
export function sameLook(a: SheetConfig, b: SheetConfig): boolean {
  return JSON.stringify(lookOf(a)) === JSON.stringify(lookOf(b));
}

const parseJson = (text: string): unknown => { try { return JSON.parse(text) as unknown; } catch { return null; } };

/** The same metadata words (both cleaned the upload tab's way). */
function sameFields(a: unknown, b: unknown): boolean {
  const x = cleanSheetMetadata(a ?? {}), y = cleanSheetMetadata(b ?? {});
  return x.title === y.title && x.description === y.description && x.tags.join("\n") === y.tags.join("\n");
}

/** Metadata as a file says it: the same words keep it as it is; cleared = none; else an edit (accepted → "edited" until ✓ Accept). */
function editedMetadata(current: SheetMetadata | null, raw: unknown): SheetMetadata | null {
  if (sameFields(current, raw)) return current;
  const fields = cleanSheetMetadata(raw);
  if (fields.title === "" && fields.description === "" && fields.tags.length === 0) return null;
  return editSheetMetadata(current, fields);
}

export interface SheetRead { artboard: FinalArtboard; unresolved: string[] }

/** An edited sheet.json onto its artboard: words, hero, captions, icons by name, locks, look changes (against `template`), metadata; null when unreadable. */
export function artboardFromSheet(a: FinalArtboard, template: SheetTemplate, text: string, assets: readonly BuilderIconAsset[]): SheetRead | null {
  const read = readPresetJson(text, artboardConfig(template, a), assets);
  if (!read.ok) return null;
  const p = read.preset, b = p.config.banner;
  const artboard: FinalArtboard = {
    ...a, title: b.title, subtitle: b.subtitle, heroIconId: b.heroIconId, captionTexts: { ...b.captionTexts },
    overrides: overridesOf(template, p.config), placedIds: p.placedIds ?? a.placedIds, lockedIds: p.lockedIds ?? a.lockedIds,
    metadata: p.metadata === undefined ? a.metadata : editedMetadata(a.metadata, p.metadata),
  };
  return { artboard, unresolved: p.unresolved };
}

/** An edited metadata.json onto its artboard's metadata; null when it is not a JSON object. */
export function artboardFromMetaFile(a: FinalArtboard, text: string): FinalArtboard | null {
  const raw = parseJson(text);
  return isRecord(raw) ? { ...a, metadata: editedMetadata(a.metadata, raw) } : null;
}

/** metadata.json already says what the app holds: the same words and state. */
export function sameMetaFile(text: string, metadata: SheetMetadata | null): boolean {
  const raw = parseJson(text);
  if (!isRecord(raw)) return false;
  return sameFields(metadata, raw) && (typeof raw.state === "string" ? raw.state : "empty") === (metadata?.state ?? "empty");
}

/** metadata.json as the app writes it now: its record (when, prompt, model, the AI's Title-Artboard, anything else) kept, the metadata current. */
export function metaFileJson(existing: string | null, metadata: SheetMetadata | null): Record<string, unknown> {
  const old = existing === null ? null : parseJson(existing);
  const m = metadata ?? emptySheetMetadata();
  return { ...(isRecord(old) ? old : {}), v: 1, state: m.state, title: m.title, description: m.description, tags: [...m.tags], validation: m.validation };
}

export interface SheetJsonContext { assets: readonly BuilderIconAsset[]; seed: number; recipe: SelectionRecipe }

/** The artboard's sheet.json as the app writes it: its whole sheet (template look + its own), icons by name, locks, metadata. */
export function artboardSheetJson(a: FinalArtboard, template: SheetTemplate, ctx: SheetJsonContext): Record<string, unknown> {
  const config = artboardConfig(template, a);
  return presetJsonOf({ name: config.banner.title, config, placedIds: a.placedIds, lockedIds: a.lockedIds,
    seed: ctx.seed, recipe: ctx.recipe, metadata: a.metadata, assets: ctx.assets });
}

const cells = (ids: readonly string[]): string => {
  const out = ids.map((id) => (isEmptySlot(id) ? "" : id));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
};
const metaKey = (m: SheetMetadata | null) => (m === null ? "" : JSON.stringify(cleanSheetMetadata(m)));

/** Locks that matter: on placed icons, in any order. */
const locks = (a: FinalArtboard) => a.lockedIds.filter((id) => a.placedIds.includes(id)).sort().join("\n");

/** Same sheet, icons, locks and metadata words — whatever empty cells are called, trailing empty cells or lock order. */
export function sameArtboard(a: FinalArtboard, b: FinalArtboard, template: SheetTemplate): boolean {
  return JSON.stringify(artboardConfig(template, a)) === JSON.stringify(artboardConfig(template, b))
    && cells(a.placedIds) === cells(b.placedIds) && locks(a) === locks(b) && metaKey(a.metadata) === metaKey(b.metadata);
}

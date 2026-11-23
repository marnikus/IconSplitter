// removal.ts — removing templates and artboards as ONE undo step (2026-11-22).
// Pure: what the two saved lists become, and which folders under
// `_artboard_sheets` move into its `.removed versions` trash (and back on undo).
// A removed template takes every artboard of it; its folder moves whole, so the
// artboard folders inside move with it. Never `_artboard_sheets` itself, never
// the trash, never a folder that still holds something kept, never outside.
// A step records only what it takes out and what it puts back (at its place) —
// never whole lists — so undoing it never undoes a later save of something else.
import { TRASH_DIR } from "../fs";
import { isRecord } from "../isrecord";
import { parseArtboards, type FinalArtboard } from "./artboards";
import { SHEETS_DIR, templateHomes } from "./sheetfolders";
import { parseTemplates, type SheetTemplate } from "./templates";

export interface FolderMove { from: string; to: string }
export interface SheetLists { templates: readonly SheetTemplate[]; artboards: readonly FinalArtboard[] }

export interface RemovalPlan {
  before: SheetLists;
  after: SheetLists;
  goneTemplates: SheetTemplate[];
  goneArtboards: FinalArtboard[];
  /** Into the trash (remove, redo) and back where they were (undo). */
  away: FolderMove[];
  back: FolderMove[];
}

export const SHEETS_TRASH = `${SHEETS_DIR}/${TRASH_DIR}`;

/** A folder below `_artboard_sheets` (the trash's own entries too) — never it or the trash itself, never climbing out. */
export function isSheetFolderPath(path: string): boolean {
  const parts = path.split("/");
  if (parts[0] !== SHEETS_DIR || parts.length < 2 || parts.some((p) => p === "" || p === "." || p === "..")) return false;
  return parts[1] !== TRASH_DIR || parts.length > 2;
}

const movable = (path: string) => isSheetFolderPath(path) && path.split("/")[1] !== TRASH_DIR;
const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYYMMDD-HHMMSS-<salt>` in local time: a trash name nothing else has. */
export function trashStamp(now: Date, salt: string): string {
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${day}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${salt}`;
}

/** `_artboard_sheets/.removed versions/<folder name>~<stamp>`. */
export function trashFolderOf(path: string, stamp: string): string {
  return `${SHEETS_TRASH}/${path.slice(path.lastIndexOf("/") + 1)}~${stamp}`;
}

/** The outermost movable folders (one inside another moves with it), none holding a kept folder, each with its own trash place. */
export function folderMoves(folders: readonly string[], kept: readonly string[], stamp: string): Pick<RemovalPlan, "away" | "back"> {
  const free = [...new Set(folders)].filter((f) => movable(f) && !kept.some((k) => inside(k, f)));
  const outer = free.filter((f) => !free.some((o) => o !== f && inside(f, o)));
  const away = outer.map((from, i) => ({ from, to: trashFolderOf(from, outer.length > 1 ? `${stamp}-${i + 1}` : stamp) }));
  return { away, back: away.map((m) => ({ from: m.to, to: m.from })) };
}

const foldersOf = (artboards: readonly FinalArtboard[]) => artboards.flatMap((a) => (a.folder === null ? [] : [a.folder]));
const keptOf = (lists: SheetLists) => [...lists.templates.flatMap((t) => (t.folder == null ? [] : [t.folder])), ...foldersOf(lists.artboards)];

interface Gone { templates: SheetTemplate[]; artboards: FinalArtboard[]; folders: string[] }

function planOf(lists: SheetLists, after: SheetLists, gone: Gone, stamp: string): RemovalPlan {
  const before = { templates: [...lists.templates], artboards: [...lists.artboards] };
  return { before, after, goneTemplates: gone.templates, goneArtboards: gone.artboards, ...folderMoves(gone.folders, keptOf(after), stamp) };
}

/** Templates and every artboard of them out; their folders — and an artboard folder living elsewhere — into the trash. */
export function templatesRemoval(lists: SheetLists, ids: readonly string[], stamp: string): RemovalPlan | null {
  const drop = new Set(ids);
  const templates = lists.templates.filter((t) => drop.has(t.id));
  if (templates.length === 0) return null;
  const artboards = lists.artboards.filter((a) => drop.has(a.templateId));
  const after = { templates: lists.templates.filter((t) => !drop.has(t.id)), artboards: lists.artboards.filter((a) => !drop.has(a.templateId)) };
  const folders = [...templates.flatMap((t) => templateHomes(t, artboards)), ...foldersOf(artboards)];
  return planOf(lists, after, { templates, artboards, folders }, stamp);
}

/** Artboards out; their own folders into the trash (their template's folder stays). */
export function artboardsRemoval(lists: SheetLists, ids: readonly string[], stamp: string): RemovalPlan | null {
  const drop = new Set(ids);
  const artboards = lists.artboards.filter((a) => drop.has(a.id));
  if (artboards.length === 0) return null;
  const after = { templates: [...lists.templates], artboards: lists.artboards.filter((a) => !drop.has(a.id)) };
  return planOf(lists, after, { templates: [], artboards, folders: foldersOf(artboards) }, stamp);
}

/** The undo entry's label. */
export function removalLabel(plan: RemovalPlan): string {
  const t = plan.goneTemplates, a = plan.goneArtboards;
  if (t.length > 0) return t.length === 1 ? `Remove template “${t[0].name}”` : `Remove ${t.length} templates`;
  return a.length === 1 ? `Remove artboard “${a[0].name}”` : `Remove ${a.length} artboards`;
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Template “X” removed with 2 artboards" / "Artboard “Y” removed" / "3 artboards removed". */
function goneText(t: readonly SheetTemplate[], a: readonly FinalArtboard[]): string {
  if (t.length === 0) return a.length === 1 ? `Artboard “${a[0].name}” removed` : `${count(a.length, "artboard")} removed`;
  const what = t.length === 1 ? `Template “${t[0].name}”` : count(t.length, "template");
  return `${what} removed${a.length > 0 ? ` with ${count(a.length, "artboard")}` : ""}`;
}

/** The toast: what went, where its folder waits, and that Undo brings it back. */
export function removalSay(plan: RemovalPlan): string {
  const where = plan.away.length === 0 ? "" : ` — ${plan.away.length === 1 ? "its folder is" : "their folders are"} in ${SHEETS_TRASH}`;
  const it = plan.goneTemplates.length + plan.goneArtboards.length === 1 ? "it" : "them";
  return `${goneText(plan.goneTemplates, plan.goneArtboards)}${where}. Undo brings ${it} back`;
}

/** Stored moves read back field by field: only moves between sheet folders survive (RULE 13). */
export function parseFolderMoves(raw: unknown): FolderMove[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is FolderMove => isRecord(m) && typeof m.from === "string" && typeof m.to === "string"
    && isSheetFolderPath(m.from) && isSheetFolderPath(m.to)).map((m) => ({ from: m.from, to: m.to }));
}

/** An item and the place it held in its list. */
export interface Placed<T> { at: number; item: T }

/** One side of a "builderArtboards" undo step: what goes out, what comes back in at its place, and the folder moves. */
export interface ListsDelta {
  templatesOut: string[];
  artboardsOut: string[];
  templatesIn: Placed<SheetTemplate>[];
  artboardsIn: Placed<FinalArtboard>[];
  moves: FolderMove[];
  /** A step recorded before 2026-11-22 carries the whole artboard list: it replaces the list. */
  wholeArtboards: FinalArtboard[] | null;
}

const NO_CHANGE: ListsDelta = { templatesOut: [], artboardsOut: [], templatesIn: [], artboardsIn: [], moves: [], wholeArtboards: null };

const placesIn = <T extends { id: string }>(list: readonly T[], items: readonly T[]): Placed<T>[] =>
  items.map((item) => ({ at: list.findIndex((x) => x.id === item.id), item }));

/** A removal's two sides: redo takes them out (folders into the trash), undo puts them back where they were. */
export function removalSides(plan: RemovalPlan): { before: ListsDelta; after: ListsDelta } {
  return {
    after: { ...NO_CHANGE, templatesOut: plan.goneTemplates.map((t) => t.id), artboardsOut: plan.goneArtboards.map((a) => a.id), moves: plan.away },
    before: { ...NO_CHANGE, templatesIn: placesIn(plan.before.templates, plan.goneTemplates),
      artboardsIn: placesIn(plan.before.artboards, plan.goneArtboards), moves: plan.back },
  };
}

/** ＋ Artboard's two sides: undo takes it out, redo puts it back at the end. */
export function addSides(lists: SheetLists, made: FinalArtboard): { before: ListsDelta; after: ListsDelta } {
  return { before: { ...NO_CHANGE, artboardsOut: [made.id] }, after: { ...NO_CHANGE, artboardsIn: [{ at: lists.artboards.length, item: made }] } };
}

/** The items put back at their places (in place order); one already there stays as it is. */
function placeIn<T extends { id: string }>(list: readonly T[], items: readonly Placed<T>[]): T[] {
  const out = [...list];
  for (const p of [...items].sort((x, y) => x.at - y.at)) {
    if (!out.some((x) => x.id === p.item.id)) out.splice(Math.min(Math.max(p.at, 0), out.length), 0, p.item);
  }
  return out;
}

/** The lists after one side: out first, then back in; never an artboard whose template is not there. */
export function applyListsDelta(lists: SheetLists, d: ListsDelta): { templates: SheetTemplate[]; artboards: FinalArtboard[] } {
  const templatesOut = new Set(d.templatesOut), artboardsOut = new Set(d.artboardsOut);
  const templates = placeIn(lists.templates.filter((t) => !templatesOut.has(t.id)), d.templatesIn);
  const known = new Set(templates.map((t) => t.id));
  const base = d.wholeArtboards ?? lists.artboards.filter((a) => !artboardsOut.has(a.id));
  return { templates, artboards: placeIn(base, d.artboardsIn).filter((a) => known.has(a.templateId)) };
}

const idsOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x !== "").slice(0, 500) : []);

/** Stored places, each item validated by its own list parser; a bad row drops. */
function placedOf<T>(raw: unknown, parse: (items: unknown[]) => T[]): Placed<T>[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => (isRecord(r) && typeof r.at === "number" && Number.isFinite(r.at)
    ? parse([r.item]).map((item) => ({ at: Math.floor(r.at as number), item })) : []));
}

const DELTA_LISTS = ["templatesOut", "artboardsOut", "templatesIn", "artboardsIn", "artboards"] as const;

/** One side read back from the timeline, field by field (RULE 13); null when it carries none of its lists. */
export function parseListsDelta(raw: unknown): ListsDelta | null {
  if (!isRecord(raw) || !DELTA_LISTS.some((k) => Array.isArray(raw[k]))) return null;
  return {
    templatesOut: idsOf(raw.templatesOut), artboardsOut: idsOf(raw.artboardsOut),
    templatesIn: placedOf(raw.templatesIn, parseTemplates), artboardsIn: placedOf(raw.artboardsIn, (items) => parseArtboards(items)),
    moves: parseFolderMoves(raw.moves), wholeArtboards: Array.isArray(raw.artboards) ? parseArtboards(raw.artboards) : null,
  };
}

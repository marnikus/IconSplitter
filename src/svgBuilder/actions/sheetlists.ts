// actions/sheetlists.ts — removing templates and artboards (2026-11-22): at once,
// as ONE undo step ("builderArtboards"). A removed template takes every artboard
// of it; the folders move into `_artboard_sheets/.removed versions` and come
// back on undo. The step records only what it took out and its place (never
// whole lists), so undoing it never undoes a later save of anything else.
// Removing, undo and redo share one path (`applyListsSide`): the folders first
// (nothing changes when they cannot move), then the lists, then the stage moves
// off what is gone — quietly, never with an undo step of its own.
import type { RowSelection } from "../../lib/reviewselect";
import type { FinalArtboard } from "../../lib/svgBuilder/artboards";
import {
  applyListsDelta, artboardsRemoval, removalLabel, removalSay, removalSides, templatesRemoval, trashStamp,
  type FolderMove, type ListsDelta, type RemovalPlan, type SheetLists,
} from "../../lib/svgBuilder/removal";
import { SHEETS_DIR } from "../../lib/svgBuilder/sheetfolders";
import type { SheetTemplate } from "../../lib/svgBuilder/templates";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import type { BuilderModel } from "../model";
import { moveSheetFolders } from "../sheetmove";
import { saveTemplates } from "../templatestore";
import { openArtboardRow } from "./artboards";
import { ensureSheetsParent, sheetsRoot } from "./sheetsroot";
import { showTemplate } from "./templates";

type Get = () => BuilderActionContext;

export function sheetListActions(get: Get): Pick<BuilderActions, "removeTemplate" | "removeTemplates" | "removeArtboards" | "applySheetLists"> {
  const removeTemplates = (ids: readonly string[]) => {
    void removeNow(get, { plan: templatesRemoval(listsOf(get().model), ids, stampNow()), empty: "No template selected", preferred: [] });
  };
  return {
    removeTemplate: (id) => removeTemplates([id]),
    removeTemplates,
    removeArtboards: (ids) => {
      const m = get().model;
      void removeNow(get, { plan: artboardsRemoval(listsOf(m), ids, stampNow()), empty: "No artboard selected", preferred: siblingOfOpen(m, ids) });
    },
    applySheetLists: (side, recent) => applyListsSide(get, side, recent),
  };
}

const listsOf = (m: BuilderModel): SheetLists => ({ templates: m.templates, artboards: m.artboards });
const stampNow = () => trashStamp(new Date(), Math.random().toString(36).slice(2, 6));

interface Removal { plan: RemovalPlan | null; empty: string; preferred: readonly string[] }

/** ✕: the folders move first, then the lists; one "builderArtboards" entry holds both sides. */
async function removeNow(get: Get, r: Removal): Promise<void> {
  const plan = r.plan;
  if (plan === null) return get().say(r.empty, true);
  if (plan.away.length > 0 && !(await ensureSheetsParent(get()))) {
    return get().say(`Open the folder that holds ${SHEETS_DIR} first — removing moves the folders too`, true);
  }
  const { before, after } = removalSides(plan);
  if (!(await applyListsSide(get, after, r.preferred))) return;
  get().hist?.push({ type: "builderArtboards", label: removalLabel(plan), origin: "svgBuilder", ids: ["artboards"], before, after });
  get().say(removalSay(plan));
}

async function moveFolders(get: Get, moves: readonly FolderMove[]): Promise<boolean> {
  const root = sheetsRoot(get(), true);
  if (root === null) { get().say(`Open the folder that holds ${SHEETS_DIR} first — the folders move with the lists`, true); return false; }
  try {
    await moveSheetFolders(root, moves);
    return true;
  } catch (error) {
    get().say(`Folders not moved — ${error instanceof Error ? error.message : "the folder refused"}`, true);
    return false;
  }
}

/** Remove, undo or redo: the folders, then the lists (written), then the stage. False = nothing changed. */
export async function applyListsSide(get: Get, side: ListsDelta, preferred: readonly string[] = []): Promise<boolean> {
  if (side.moves.length > 0 && !(await moveFolders(get, side.moves))) return false;
  const ctx = get();
  const patch = listsPatch(ctx.model, applyListsDelta(listsOf(ctx.model), side));
  ctx.dispatch(patch);
  if (side.templatesOut.length > 0 || side.templatesIn.length > 0) saveTemplates(patch.templates);
  saveArtboards(patch.artboards);
  moveStage(ctx.model, { ...ctx, model: { ...ctx.model, ...patch } }, preferred);
  return true;
}

type ListsPatch = Pick<BuilderModel, "templates" | "artboards" | "templateSel" | "artboardSel" | "editingTemplateId" | "editingArtboardId">;

/** The new lists and every selection without what left. */
function listsPatch(m: BuilderModel, lists: { templates: SheetTemplate[]; artboards: FinalArtboard[] }): ListsPatch {
  const templateIds = new Set(lists.templates.map((t) => t.id));
  const artboardIds = new Set(lists.artboards.map((a) => a.id));
  return {
    ...lists, templateSel: keptSel(m.templateSel, templateIds), artboardSel: keptSel(m.artboardSel, artboardIds),
    editingTemplateId: keptId(m.editingTemplateId, templateIds), editingArtboardId: keptId(m.editingArtboardId, artboardIds),
  };
}

const keptId = (id: string | null, ids: ReadonlySet<string>) => (id !== null && ids.has(id) ? id : null);

function keptSel(sel: RowSelection, ids: ReadonlySet<string>): RowSelection {
  return { checked: sel.checked.filter((id) => ids.has(id)), active: keptId(sel.active, ids), anchor: keptId(sel.anchor, ids) };
}

/**
 * The stage never shows what is gone: an open artboard that left gives way to a
 * preferred one (its neighbour, or the one viewed before), else another of its
 * template, else that template or the nearest one left; a removed template on
 * the stage gives way to the nearest template left (the one above first).
 */
function moveStage(before: BuilderModel, ctx: BuilderActionContext, preferred: readonly string[]): void {
  const m = ctx.model;
  if (before.editingArtboardId !== null && m.editingArtboardId === null) {
    const templateId = before.artboards.find((a) => a.id === before.editingArtboardId)?.templateId ?? null;
    const next = preferred.find((id) => m.artboards.some((a) => a.id === id)) ?? m.artboards.find((a) => a.templateId === templateId)?.id;
    if (next !== undefined) return openArtboardRow(ctx, next);
    return showNearest(ctx, before.templates, templateId);
  }
  if (before.editingTemplateId !== null && m.editingTemplateId === null) showNearest(ctx, before.templates, before.editingTemplateId);
}

function showNearest(ctx: BuilderActionContext, all: readonly SheetTemplate[], id: string | null): void {
  const left = new Set(ctx.model.templates.map((t) => t.id));
  const at = all.findIndex((t) => t.id === id);
  if (at < 0) return;
  const next = [all[at], ...all.slice(0, at).reverse(), ...all.slice(at + 1)].find((t) => left.has(t.id));
  if (next !== undefined) showTemplate(ctx, next.id);
}

/** Removing the open artboard: the one before it of its template, else the next (2026-11-16). */
function siblingOfOpen(m: BuilderModel, ids: readonly string[]): string[] {
  const open = m.editingArtboardId;
  if (open === null || !ids.includes(open)) return [];
  const templateId = m.artboards.find((a) => a.id === open)?.templateId;
  const mine = m.artboards.filter((a) => a.templateId === templateId);
  const at = mine.findIndex((a) => a.id === open);
  const next = [...mine.slice(0, at).reverse(), ...mine.slice(at + 1)].find((a) => !ids.includes(a.id));
  return next === undefined ? [] : [next.id];
}

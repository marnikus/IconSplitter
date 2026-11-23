// actions/artboards.ts — final artboards (2026-11-13). Templates are checkable
// blueprints (RULE 25 gestures); the artboards of the checked templates (else
// of the active one) form one list with the same gestures. Activating an
// artboard opens it on the stage: its template's look, its own words, hero,
// icons, locks and metadata — and every edit on the stage is written back to
// it on ✓ Save artboard (artboarddraft.ts, 2026-11-14). A new artboard starts with
// one random icon and the template's sample words (startpick.ts).
import { applyRowGesture, setChecked as setCheckedIds, toggleChecked, type RowSelection, type SelectIntent } from "../../lib/reviewselect";
import { ARTBOARD_LIMIT, artboardConfig, artboardsWithout, newArtboard, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { addSides } from "../../lib/svgBuilder/removal";
import { cleanTemplateName } from "../../lib/svgBuilder/templates";
import { emptySlotFor, placedOnly } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { blockLeave } from "./leaveguard";
import { editTemplate, showTemplate } from "./templates";
import { saveSheetConfig } from "../configstore";
import { visibleArtboards } from "../artboardview";
import { commitConfig, prefs } from "./config";
import { startIcons } from "./startpick";
import { seedArtboardFolder } from "./sheetexport";
import { artboardFromStage, openArtboardOf } from "../artboarddraft";

type ArtboardActions = Pick<BuilderActions,
  "templateGesture" | "toggleTemplateCheck" | "setTemplateChecks" | "addArtboard" | "artboardGesture" | "toggleArtboardCheck"
  | "setArtboardChecks" | "renameArtboard" | "closeArtboard" | "resetArtboardLook" | "openArtboard" | "saveArtboard" | "resetArtboard" | "showArtboard">;

export function artboardActions(get: () => BuilderActionContext): ArtboardActions {
  return {
    templateGesture: (id, intent) => templateGesture(get(), id, intent),
    toggleTemplateCheck: (id) => { const c = get(); setTemplateSel(c, { ...c.model.templateSel, checked: toggleChecked(c.model.templateSel.checked, id) }); },
    setTemplateChecks: (ids, on) => { const c = get(); setTemplateSel(c, { ...c.model.templateSel, checked: setCheckedIds(c.model.templateSel.checked, ids, on) }); },
    addArtboard: (templateId) => { const id = addArtboard(get(), templateId); if (id !== null) void seedArtboardFolder(get, id); },
    artboardGesture: (id, intent) => artboardGesture(get(), id, intent),
    toggleArtboardCheck: (id) => { const c = get(); c.dispatch({ artboardSel: { ...c.model.artboardSel, checked: toggleChecked(c.model.artboardSel.checked, id) } }); },
    setArtboardChecks: (ids, on) => { const c = get(); c.dispatch({ artboardSel: { ...c.model.artboardSel, checked: setCheckedIds(c.model.artboardSel.checked, ids, on) } }); },
    renameArtboard: (id, name) => renameArtboard(get(), id, name),
    closeArtboard: () => get().dispatch({ editingArtboardId: null }),
    resetArtboardLook: (id) => resetArtboardLook(get(), id),
    saveArtboard: () => saveArtboard(get()),
    showArtboard: (id, templateId) => showArtboard(get(), id, templateId),
    resetArtboard: () => resetArtboard(get()),
    openArtboard: (id) => { const c = get(); if (c.model.editingArtboardId !== id && !blockLeave(c, { kind: "artboard", id })) openArtboardRow(c, id); },
  };
}

/** ＋ Artboard as ONE undo step (2026-11-16); since 2026-11-22 only that artboard is recorded, so undo never rewinds other saves. */
function recordAdd(ctx: BuilderActionContext, made: FinalArtboard, label: string): void {
  const { before, after } = addSides({ templates: ctx.model.templates, artboards: ctx.model.artboards }, made);
  ctx.hist?.push({ type: "builderArtboards", label, origin: "svgBuilder", ids: ["artboards"], before, after });
}

function storeArtboards(ctx: BuilderActionContext, artboards: readonly FinalArtboard[]): void {
  ctx.dispatch({ artboards });
  saveArtboards(artboards);
}

function setTemplateSel(ctx: BuilderActionContext, templateSel: RowSelection): void {
  ctx.dispatch({ templateSel });
}

/**
 * A plain click / arrow key on a template SELECTS AND OPENS it for editing (2026-11-14; no ✎ step):
 * its design goes on the stage, and the first change is already an edit of it.
 * Ctrl/Shift only check rows. A changed template asks Save / Discard first.
 */
function templateGesture(ctx: BuilderActionContext, id: string, intent: SelectIntent): void {
  const visibleIds = ctx.model.templates.map((t) => t.id);
  const next = applyRowGesture(ctx.model.templateSel, { id, intent, visibleIds });
  const opens = intent === "replace" && next.active !== null && next.active !== ctx.model.editingTemplateId;
  if (opens && blockLeave(ctx, { kind: "template", id: next.active! })) return;
  setTemplateSel(ctx, next);
  if (opens) editTemplate(ctx, next.active!, false);
}

const artboardId = () => `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** "+ Artboard": a new, empty final artboard of the template, opened on the stage to pick icons. */
export function addArtboard(ctx: BuilderActionContext, templateId: string, guard = true): string | null {
  const template = ctx.model.templates.find((t) => t.id === templateId);
  if (template === undefined) { ctx.say("That template is gone", true); return null; }
  if (guard && blockLeave(ctx, { kind: "add-artboard", id: templateId })) return null;
  if (ctx.model.artboards.length >= ARTBOARD_LIMIT) { ctx.say(`At most ${ARTBOARD_LIMIT} artboards — remove some first`, true); return null; }
  const capacity = template.config.grid.columns * template.config.grid.rows;
  const created = newArtboard(template, ctx.model.artboards, { now: new Date().toISOString(), id: artboardId(), placedIds: startIcons(ctx, capacity) });
  storeArtboards(ctx, [...ctx.model.artboards, created]);
  recordAdd(ctx, created, `Add artboard “${created.name}”`);
  const checked = ctx.model.templateSel.checked;
  ctx.dispatch({ templateSel: { ...ctx.model.templateSel, active: templateId, checked: checked.length > 0 && !checked.includes(templateId) ? [...checked, templateId] : checked } });
  openArtboard(ctx, created);
  ctx.dispatch({ artboardSel: { ...ctx.model.artboardSel, active: created.id, anchor: created.id } });
  ctx.say(`Artboard “${created.name}” added — ${placedOnly(created.placedIds).length} icons and sample words to start; change any of them`);
  return created.id;
}

function artboardGesture(ctx: BuilderActionContext, id: string, intent: SelectIntent): void {
  const visibleIds = visibleArtboards(ctx.model).map((a) => a.id);
  const next = applyRowGesture(ctx.model.artboardSel, { id, intent, visibleIds });
  const artboard = ctx.model.artboards.find((a) => a.id === next.active);
  const opens = artboard !== undefined && next.active !== ctx.model.editingArtboardId;
  if (opens && blockLeave(ctx, { kind: "artboard", id: artboard.id })) return; // a changed template asks first
  ctx.dispatch({ artboardSel: next });
  if (opens) openArtboard(ctx, artboard);
}

/** Its template selected; with checked templates, it joins them so its artboard stays in the list. */
function showing(sel: RowSelection, templateId: string): RowSelection {
  const checked = sel.checked.length > 0 && !sel.checked.includes(templateId) ? [...sel.checked, templateId] : sel.checked;
  return { ...sel, active: templateId, anchor: templateId, checked };
}

/**
 * ↺ Template: the artboard inherits its template's whole look again. Open on
 * the stage, the sheet goes back to the template look as one undo step (and
 * the sync writes the empty override list); closed, the stored list empties.
 */
function resetArtboardLook(ctx: BuilderActionContext, id: string): void {
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  const template = ctx.model.templates.find((t) => t.id === artboard?.templateId);
  if (artboard === undefined || template === undefined) return;
  const reset = { ...artboard, overrides: {}, updated: new Date().toISOString() };
  storeArtboards(ctx, ctx.model.artboards.map((a) => (a.id === id ? reset : a)));
  if (ctx.model.editingArtboardId === id) commitConfig(ctx, { config: artboardConfig(template, reset), label: `“${artboard.name}” follows its template again` });
  ctx.say(`“${artboard.name}” follows its template again`);
}

/** Saved artboards lose icons the library no longer has (scan, 🗑 decline); written at once. */
export function pruneArtboards(ctx: BuilderActionContext, known: ReadonlySet<string>): void {
  const next = artboardsWithout(ctx.model.artboards, known);
  if (next.some((a, i) => a !== ctx.model.artboards[i])) storeArtboards(ctx, next);
}

/** ✓ Save artboard: the stage's words, icons, locks, metadata, captions and own look changes become the artboard. */
export function saveArtboard(ctx: BuilderActionContext): void {
  const open = openArtboardOf(ctx.model);
  if (open === null) return;
  const saved = { ...artboardFromStage(open, ctx.model, ctx.placedIds), updated: new Date().toISOString() };
  storeArtboards(ctx, ctx.model.artboards.map((a) => (a.id === open.id ? saved : a)));
  ctx.say(`Artboard “${open.name}” saved`);
}

/** ↺ Reset: the stage goes back to the saved artboard (its look as one undo step). */
function resetArtboard(ctx: BuilderActionContext): void {
  const open = openArtboardOf(ctx.model);
  const template = ctx.model.templates.find((t) => t.id === open?.templateId);
  if (open === null || template === undefined) return;
  commitConfig(ctx, { config: artboardConfig(template, open), label: `Reset “${open.name}”` });
  openArtboard(ctx, open);
  ctx.say(`Artboard “${open.name}” back to what is saved`);
}

/**
 * After undo / redo took the open artboard away: that artboard (no leave question
 * — the gone one cannot be saved), else its template, shown without an undo step
 * of its own (2026-11-22: a step pushed while undoing would cut the redo branch).
 */
function showArtboard(ctx: BuilderActionContext, id: string | null, templateId: string | null): void {
  if (id !== null) return openArtboardRow(ctx, id);
  if (templateId !== null && ctx.model.templates.some((t) => t.id === templateId)) return showTemplate(ctx, templateId);
  ctx.dispatch({ editingArtboardId: null });
}

/** After the leave question: the artboard becomes the active row and opens. */
export function openArtboardRow(ctx: BuilderActionContext, id: string): void {
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (artboard === undefined) return;
  ctx.dispatch({ artboardSel: { ...ctx.model.artboardSel, active: id, anchor: id } });
  openArtboard(ctx, artboard);
}

/**
 * Puts the artboard on the stage. Opening is navigation, not an edit: no undo
 * entry; edits stay a draft until ✓ Save artboard (artboarddraft.ts).
 */
function openArtboard(ctx: BuilderActionContext, artboard: FinalArtboard): void {
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return ctx.say("This artboard's template is gone", true);
  const config = artboardConfig(template, artboard);
  const capacity = config.grid.columns * config.grid.rows;
  const known = ctx.assets.length > 0 ? new Set(ctx.assets.map((a) => a.id)) : null;
  const ids = (known === null ? artboard : artboardsWithout([artboard], known)[0]).placedIds.slice(0, capacity);
  while (ids.length < capacity) ids.push(emptySlotFor(ids));
  ctx.dispatch({ config, lockedIds: artboard.lockedIds, metadata: artboard.metadata, editingArtboardId: artboard.id, editingTemplateId: null,
    // the open artboard is always listed under a selected template (2026-11-14); callers make it the active row
    templateSel: showing(ctx.model.templateSel, artboard.templateId) });
  saveSheetConfig(config);
  ctx.setCheckedQuiet(ids);
  prefs(ctx, { layout: "custom", fit: true });
  if (placedOnly(ids).length === 0) ctx.say(`Artboard “${artboard.name}” — no icons yet: pick them in the library, or Reshuffle`);
}

function renameArtboard(ctx: BuilderActionContext, id: string, name: string): void {
  const clean = cleanTemplateName(name);
  const artboard = ctx.model.artboards.find((a) => a.id === id);
  if (artboard === undefined || clean === artboard.name) return;
  if (clean === "") return ctx.say("An artboard needs a name", true);
  storeArtboards(ctx, ctx.model.artboards.map((a) => (a.id === id ? { ...a, name: clean, updated: new Date().toISOString() } : a)));
}


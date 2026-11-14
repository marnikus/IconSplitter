// actions/artboards.ts — final artboards (2026-11-13). Templates are checkable
// blueprints (RULE 25 gestures); the artboards of the checked templates (else
// of the active one) form one list with the same gestures. Activating an
// artboard opens it on the stage: its template's look, its own words, hero,
// icons, locks and metadata — and every edit on the stage is written back to
// it on ✓ Save artboard (artboarddraft.ts, 2026-11-14). A new artboard starts with
// one random icon and the template's sample words (startpick.ts).
import { applyRowGesture, setChecked as setCheckedIds, toggleChecked, type RowSelection, type SelectIntent } from "../../lib/reviewselect";
import { ARTBOARD_LIMIT, artboardConfig, artboardsWithout, newArtboard, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { cleanTemplateName } from "../../lib/svgBuilder/templates";
import { emptySlotFor, placedOnly } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { blockLeave } from "./leaveguard";
import { editTemplate } from "./templates";
import { saveSheetConfig } from "../configstore";
import { visibleArtboards } from "../artboardview";
import { commitConfig, prefs } from "./config";
import { startIcons } from "./startpick";
import { artboardFromStage, openArtboardOf } from "../artboarddraft";

type ArtboardActions = Pick<BuilderActions,
  "templateGesture" | "toggleTemplateCheck" | "setTemplateChecks" | "addArtboard" | "artboardGesture" | "toggleArtboardCheck"
  | "setArtboardChecks" | "renameArtboard" | "removeArtboards" | "closeArtboard" | "resetArtboardLook" | "openArtboard" | "saveArtboard" | "resetArtboard">;

export function artboardActions(get: () => BuilderActionContext): ArtboardActions {
  return {
    templateGesture: (id, intent) => templateGesture(get(), id, intent),
    toggleTemplateCheck: (id) => { const c = get(); setTemplateSel(c, { ...c.model.templateSel, checked: toggleChecked(c.model.templateSel.checked, id) }); },
    setTemplateChecks: (ids, on) => { const c = get(); setTemplateSel(c, { ...c.model.templateSel, checked: setCheckedIds(c.model.templateSel.checked, ids, on) }); },
    addArtboard: (templateId) => addArtboard(get(), templateId),
    artboardGesture: (id, intent) => artboardGesture(get(), id, intent),
    toggleArtboardCheck: (id) => { const c = get(); c.dispatch({ artboardSel: { ...c.model.artboardSel, checked: toggleChecked(c.model.artboardSel.checked, id) } }); },
    setArtboardChecks: (ids, on) => { const c = get(); c.dispatch({ artboardSel: { ...c.model.artboardSel, checked: setCheckedIds(c.model.artboardSel.checked, ids, on) } }); },
    renameArtboard: (id, name) => renameArtboard(get(), id, name),
    removeArtboards: (ids) => removeArtboards(get(), ids),
    closeArtboard: () => get().dispatch({ editingArtboardId: null }),
    resetArtboardLook: (id) => resetArtboardLook(get(), id),
    saveArtboard: () => saveArtboard(get()),
    resetArtboard: () => resetArtboard(get()),
    openArtboard: (id) => { const c = get(); if (c.model.editingArtboardId !== id && !blockLeave(c, { kind: "artboard", id })) openArtboardRow(c, id); },
  };
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
export function addArtboard(ctx: BuilderActionContext, templateId: string, guard = true): void {
  const template = ctx.model.templates.find((t) => t.id === templateId);
  if (template === undefined) return ctx.say("That template is gone", true);
  if (guard && blockLeave(ctx, { kind: "add-artboard", id: templateId })) return;
  if (ctx.model.artboards.length >= ARTBOARD_LIMIT) return ctx.say(`At most ${ARTBOARD_LIMIT} artboards — remove some first`, true);
  const capacity = template.config.grid.columns * template.config.grid.rows;
  const created = newArtboard(template, ctx.model.artboards, { now: new Date().toISOString(), id: artboardId(), placedIds: startIcons(ctx, capacity) });
  storeArtboards(ctx, [...ctx.model.artboards, created]);
  const checked = ctx.model.templateSel.checked;
  ctx.dispatch({ templateSel: { ...ctx.model.templateSel, active: templateId, checked: checked.length > 0 && !checked.includes(templateId) ? [...checked, templateId] : checked } });
  openArtboard(ctx, created);
  ctx.dispatch({ artboardSel: { ...ctx.model.artboardSel, active: created.id, anchor: created.id } });
  ctx.say(`Artboard “${created.name}” added — ${placedOnly(created.placedIds).length} icons and sample words to start; change any of them`);
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

function removeArtboards(ctx: BuilderActionContext, ids: readonly string[]): void {
  const drop = new Set(ids);
  const gone = ctx.model.artboards.filter((a) => drop.has(a.id));
  if (gone.length === 0) return ctx.say("No artboard selected", true);
  storeArtboards(ctx, ctx.model.artboards.filter((a) => !drop.has(a.id)));
  const sel = ctx.model.artboardSel;
  ctx.dispatch({
    artboardSel: { checked: sel.checked.filter((id) => !drop.has(id)), active: sel.active !== null && drop.has(sel.active) ? null : sel.active, anchor: null },
    ...(ctx.model.editingArtboardId !== null && drop.has(ctx.model.editingArtboardId) ? { editingArtboardId: null } : {}),
  });
  ctx.say(gone.length === 1 ? `Artboard “${gone[0].name}” removed` : `${gone.length} artboards removed`);
}

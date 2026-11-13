// actions/artboards.ts — final artboards (2026-11-13). Templates are checkable
// blueprints (RULE 25 gestures); the artboards of the checked templates (else
// of the active one) form one list with the same gestures. Activating an
// artboard opens it on the stage: its template's look, its own words, hero,
// icons, locks and metadata — and every edit on the stage is written back to
// it (useArtboardSync). A new artboard opens empty, asking for icons.
import { applyRowGesture, setChecked as setCheckedIds, toggleChecked, type RowSelection, type SelectIntent } from "../../lib/reviewselect";
import { ARTBOARD_LIMIT, artboardConfig, newArtboard, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { cleanTemplateName } from "../../lib/svgBuilder/templates";
import { emptySlotFor, placedOnly } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { saveSheetConfig } from "../configstore";
import { visibleArtboards } from "../artboardview";
import { prefs } from "./config";

type ArtboardActions = Pick<BuilderActions,
  "templateGesture" | "toggleTemplateCheck" | "setTemplateChecks" | "addArtboard" | "artboardGesture" | "toggleArtboardCheck"
  | "setArtboardChecks" | "renameArtboard" | "removeArtboards" | "closeArtboard">;

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
  };
}

function storeArtboards(ctx: BuilderActionContext, artboards: readonly FinalArtboard[]): void {
  ctx.dispatch({ artboards });
  saveArtboards(artboards);
}

function setTemplateSel(ctx: BuilderActionContext, templateSel: RowSelection): void {
  ctx.dispatch({ templateSel });
}

function templateGesture(ctx: BuilderActionContext, id: string, intent: SelectIntent): void {
  const visibleIds = ctx.model.templates.map((t) => t.id);
  setTemplateSel(ctx, applyRowGesture(ctx.model.templateSel, { id, intent, visibleIds }));
}

const artboardId = () => `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** "+ Artboard": a new, empty final artboard of the template, opened on the stage to pick icons. */
function addArtboard(ctx: BuilderActionContext, templateId: string): void {
  const template = ctx.model.templates.find((t) => t.id === templateId);
  if (template === undefined) return ctx.say("That template is gone", true);
  if (ctx.model.artboards.length >= ARTBOARD_LIMIT) return ctx.say(`At most ${ARTBOARD_LIMIT} artboards — remove some first`, true);
  const created = newArtboard(template, ctx.model.artboards, new Date().toISOString(), artboardId());
  storeArtboards(ctx, [...ctx.model.artboards, created]);
  const checked = ctx.model.templateSel.checked;
  ctx.dispatch({ templateSel: { ...ctx.model.templateSel, active: templateId, checked: checked.length > 0 && !checked.includes(templateId) ? [...checked, templateId] : checked } });
  openArtboard(ctx, created);
  ctx.dispatch({ artboardSel: { ...ctx.model.artboardSel, active: created.id, anchor: created.id } });
  ctx.say(`Artboard “${created.name}” added — pick its icons in the library, or Reshuffle`);
}

function artboardGesture(ctx: BuilderActionContext, id: string, intent: SelectIntent): void {
  const visibleIds = visibleArtboards(ctx.model).map((a) => a.id);
  const next = applyRowGesture(ctx.model.artboardSel, { id, intent, visibleIds });
  ctx.dispatch({ artboardSel: next });
  const artboard = ctx.model.artboards.find((a) => a.id === next.active);
  if (artboard !== undefined && next.active !== ctx.model.editingArtboardId) openArtboard(ctx, artboard);
}

/**
 * Puts the artboard on the stage. Opening is navigation, not an edit: no undo
 * entry; the sync starts with the next render (useArtboardSync).
 */
function openArtboard(ctx: BuilderActionContext, artboard: FinalArtboard): void {
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return ctx.say("This artboard's template is gone", true);
  const config = artboardConfig(template, artboard);
  const capacity = config.grid.columns * config.grid.rows;
  const ids = artboard.placedIds.slice(0, capacity);
  while (ids.length < capacity) ids.push(emptySlotFor(ids));
  ctx.dispatch({ config, lockedIds: artboard.lockedIds, metadata: artboard.metadata, editingArtboardId: artboard.id, editingTemplateId: null });
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

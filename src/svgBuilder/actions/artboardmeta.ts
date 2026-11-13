// actions/artboardmeta.ts — sheet metadata for final artboards (2026-11-13).
// Each artboard gets its OWN metadata (a template has none). For the checked
// artboards the app composes each one, renders the exact 768 px JPEG, and shows
// every request in one confirmation (RULE 20): nothing is sent before "Send N
// exact requests". Then one request per artboard, in order, no retry; a valid
// answer is accepted on its artboard, an invalid one is kept and marked invalid.
import { acceptSheetMetadata } from "../../lib/svgBuilder/metadata";
import { artboardConfig, artboardIcons, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import { composeSheet } from "../../lib/svgBuilder/compose";
import { computeLayout } from "../../lib/svgBuilder/layout";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import type { ArtboardMetaRequest } from "../model";
import { sheetPreviewFor } from "../preview";
import { generateSheetMetadata } from "../runSheetMetadata";

type ArtboardMetaActions = Pick<BuilderActions, "generateArtboardsMetadata" | "confirmArtboardsMetadata" | "cancelArtboardsMetadata">;

export function artboardMetaActions(get: () => BuilderActionContext): ArtboardMetaActions {
  return {
    generateArtboardsMetadata: (ids) => { void prepare(get(), ids); },
    confirmArtboardsMetadata: () => { void send(get); },
    cancelArtboardsMetadata: () => get().dispatch({ dialog: "none", artboardMeta: null, status: "Artboard metadata cancelled — nothing was sent" }),
  };
}

/** Every icon's SVG text the artboards need, read once from the scanned folder. */
async function svgTextsFor(ctx: BuilderActionContext, artboards: readonly FinalArtboard[]): Promise<Record<string, string>> {
  const texts: Record<string, string> = { ...ctx.model.svgTexts };
  const repo = ctx.repository;
  if (repo === null) return texts;
  const missing = [...new Set(artboards.flatMap(artboardIcons))].filter((id) => texts[id] === undefined);
  for (const id of missing) texts[id] = (await repo.readSvg(id)) ?? "";
  return texts;
}

async function requestFor(ctx: BuilderActionContext, artboard: FinalArtboard, svgTexts: Record<string, string>): Promise<ArtboardMetaRequest | string> {
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return `${artboard.name}: its template is gone`;
  if (artboardIcons(artboard).length === 0) return `${artboard.name}: no icons yet`;
  const config = artboardConfig(template, artboard);
  const doc = composeSheet({ config, layout: computeLayout(config), assets: ctx.assets, placedIds: artboard.placedIds, svgTexts });
  const preview = await sheetPreviewFor(doc.svg);
  return preview.ok ? { id: artboard.id, name: artboard.name, preview: preview.dataUrl } : `${artboard.name}: preview failed (${preview.reason})`;
}

async function prepare(ctx: BuilderActionContext, ids: readonly string[]): Promise<void> {
  if (ctx.model.key.value === null) return ctx.say("Save the Gemini API key before generating metadata", true);
  const artboards = ctx.model.artboards.filter((a) => ids.includes(a.id));
  if (artboards.length === 0) return ctx.say("Check the artboards to describe first", true);
  ctx.setBusy("Preparing the exact requests…");
  try {
    const texts = await svgTextsFor(ctx, artboards);
    const out = await Promise.all(artboards.map((a) => requestFor(ctx, a, texts)));
    const requests = out.filter((r): r is ArtboardMetaRequest => typeof r !== "string");
    const skipped = out.filter((r): r is string => typeof r === "string");
    if (requests.length === 0) return ctx.say(`Nothing to send — ${skipped.join("; ")}`, true);
    ctx.dispatch({ dialog: "artboards-metadata", svgTexts: texts, artboardMeta: { requests, skipped, done: 0, running: false } });
  } finally {
    ctx.setBusy(null);
  }
}

/** One request per artboard, in order; a failure stops nothing else and is reported. */
async function send(get: () => BuilderActionContext): Promise<void> {
  const start = get();
  const plan = start.model.artboardMeta;
  const key = start.model.key.value;
  if (plan === null || key === null) return start.say("The exact requests or the key are missing — nothing was sent", true);
  start.dispatch({ artboardMeta: { ...plan, running: true } });
  const failed: string[] = [];
  for (const [i, req] of plan.requests.entries()) {
    const out = await generateSheetMetadata({ config: get().model.gemini, apiKey: key, prompt: get().model.prompt, preview: req.preview });
    if (out.ok) store(get(), req.id, out.draft);
    else failed.push(`${req.name}: ${out.reason}`);
    const now = get().model.artboardMeta;
    if (now !== null) get().dispatch({ artboardMeta: { ...now, done: i + 1 } });
  }
  get().dispatch({ dialog: "none", artboardMeta: null });
  get().say(failed.length === 0 ? `Metadata generated for ${plan.requests.length} artboard(s)` : `Metadata: ${failed.length} request(s) failed — ${failed.join("; ")}`, failed.length > 0);
}

function store(ctx: BuilderActionContext, id: string, draft: Parameters<typeof acceptSheetMetadata>[0]): void {
  const metadata = acceptSheetMetadata(draft);
  const artboards = ctx.model.artboards.map((a) => (a.id === id ? { ...a, metadata, updated: new Date().toISOString() } : a));
  ctx.dispatch({ artboards, ...(ctx.model.editingArtboardId === id ? { metadata } : {}) });
  saveArtboards(artboards);
}

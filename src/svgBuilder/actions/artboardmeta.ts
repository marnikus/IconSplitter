// actions/artboardmeta.ts — sheet metadata for final artboards (2026-11-13).
// Each artboard gets its OWN metadata (a template has none). For the checked
// artboards the app composes each one's icons (no banner) — or its whole sheet,
// when the user ticks it (2026-11-23) — as one PNG of at most 1 MP (2026-11-14,
// metaimagefor.ts), and shows
// every request in one confirmation (RULE 20): nothing is sent before "Send N
// exact requests". Then one request per artboard, in order, no retry; a valid
// answer is accepted on its artboard, an invalid one is kept and marked invalid.
import { acceptSheetMetadata } from "../../lib/svgBuilder/metadata";
import { createLimiter } from "../../lib/limiter";
import { artboardConfig, artboardIcons, withSheetAnswer, type FinalArtboard } from "../../lib/svgBuilder/artboards";
import type { SheetMetadata } from "../../lib/svgBuilder/types";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import type { ArtboardMetaRequest } from "../model";
import { iconsImageFor } from "../metaimagefor";
import { generateSheetMetadata } from "../runSheetMetadata";
import { saveSheetMetadataFiles } from "./sheetexport";
import { prefs } from "./config";
import { prepareMetadata } from "./provider";

type ArtboardMetaActions = Pick<BuilderActions, "generateArtboardsMetadata" | "confirmArtboardsMetadata" | "cancelArtboardsMetadata" | "setMetaOptions">;

export function artboardMetaActions(get: () => BuilderActionContext): ArtboardMetaActions {
  return {
    generateArtboardsMetadata: (ids) => { void prepare(get(), ids); },
    confirmArtboardsMetadata: () => { void send(get); },
    cancelArtboardsMetadata: () => get().dispatch({ dialog: "none", artboardMeta: null, status: "Artboard metadata cancelled — nothing was sent" }),
    setMetaOptions: (patch) => setMetaOptions(get(), patch),
  };
}

/**
 * The two choices in the confirmation (2026-11-23), remembered: the image (whole
 * sheet or icons only) — an open confirmation draws its exact requests again —
 * and whether the answer's title replaces the banner words.
 */
function setMetaOptions(ctx: BuilderActionContext, patch: { fullSheet?: boolean; titleToBanner?: boolean }): void {
  prefs(ctx, { ...(patch.fullSheet === undefined ? {} : { metaFullSheet: patch.fullSheet }), ...(patch.titleToBanner === undefined ? {} : { metaTitleToBanner: patch.titleToBanner }) });
  if (patch.fullSheet === undefined) return;
  if (ctx.model.dialog === "artboards-metadata" && ctx.model.artboardMeta !== null) void prepare(ctx, ctx.model.artboardMeta.ids, patch.fullSheet);
  else if (ctx.model.dialog === "metadata") void prepareMetadata(ctx, patch.fullSheet);
}

/** Every icon's SVG text the artboards need, read concurrently once from the scanned folder. */
export async function svgTextsFor(ctx: BuilderActionContext, artboards: readonly FinalArtboard[]): Promise<Record<string, string>> {
  const texts: Record<string, string> = { ...ctx.model.svgTexts };
  const repo = ctx.repository;
  if (repo === null) return texts;
  const missing = [...new Set(artboards.flatMap(artboardIcons))].filter((id) => texts[id] === undefined);
  if (missing.length === 0) return texts;
  const limit = createLimiter(128);
  await Promise.all(missing.map((id) => limit(async () => { texts[id] = (await repo.readSvg(id)) ?? ""; })));
  return texts;
}

async function requestFor(ctx: BuilderActionContext, artboard: FinalArtboard, svgTexts: Record<string, string>, full: boolean): Promise<ArtboardMetaRequest | string> {
  const template = ctx.model.templates.find((t) => t.id === artboard.templateId);
  if (template === undefined) return `${artboard.name}: its template is gone`;
  if (artboardIcons(artboard).length === 0) return `${artboard.name}: no icons yet`;
  const preview = await iconsImageFor({ config: artboardConfig(template, artboard), assets: ctx.assets, placedIds: artboard.placedIds, svgTexts, full });
  return preview.ok ? { id: artboard.id, name: artboard.name, preview: preview.dataUrl } : `${artboard.name}: image failed (${preview.reason})`;
}

async function prepare(ctx: BuilderActionContext, ids: readonly string[], full = ctx.model.prefs.metaFullSheet): Promise<void> {
  if (ctx.model.key.value === null) return ctx.say("Save the Gemini API key before generating metadata", true);
  const artboards = ctx.model.artboards.filter((a) => ids.includes(a.id));
  if (artboards.length === 0) return ctx.say("Check the artboards to describe first", true);
  ctx.setBusy("Preparing the exact requests…");
  try {
    const texts = await svgTextsFor(ctx, artboards);
    const out = await Promise.all(artboards.map((a) => requestFor(ctx, a, texts, full)));
    const requests = out.filter((r): r is ArtboardMetaRequest => typeof r !== "string");
    const skipped = out.filter((r): r is string => typeof r === "string");
    if (requests.length === 0) return ctx.say(`Nothing to send — ${skipped.join("; ")}`, true);
    ctx.dispatch({ dialog: "artboards-metadata", svgTexts: texts, artboardMeta: { ids: [...ids], requests, skipped, done: 0, running: false } });
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
    if (out.ok) {
      const metadata = acceptSheetMetadata(out.draft);
      store(get(), req.id, { metadata, artboardTitle: out.artboardTitle });
      // its folder under _artboard_sheets is created now: metadata.json + the exact image sent (2026-11-14)
      const problem = await saveSheetMetadataFiles(get, req.id, { metadata, artboardTitle: out.artboardTitle, prompt: get().model.prompt, model: get().model.gemini.model, preview: req.preview });
      if (problem !== null) failed.push(problem);
    } else failed.push(`${req.name}: ${out.reason}`);
    const now = get().model.artboardMeta;
    if (now !== null) get().dispatch({ artboardMeta: { ...now, done: i + 1 } });
  }
  get().dispatch({ dialog: "none", artboardMeta: null });
  get().say(failed.length === 0 ? `Metadata generated for ${plan.requests.length} artboard(s)` : `Metadata: ${failed.length} request(s) failed — ${failed.join("; ")}`, failed.length > 0);
}

/**
 * The answer on its artboard: the metadata (accepted when valid, else kept as
 * invalid) and its visible title / subtitle. An artboard open on the stage gets
 * the same words and metadata on the stage, so it shows no unsaved change.
 */
function store(ctx: BuilderActionContext, id: string, answer: { metadata: SheetMetadata; artboardTitle: string }): void {
  const toBanner = ctx.model.prefs.metaTitleToBanner; // unticked: only the metadata (2026-11-23)
  const artboards = ctx.model.artboards.map((a) => (a.id === id ? { ...withSheetAnswer(a, answer, toBanner), updated: new Date().toISOString() } : a));
  const saved = artboards.find((a) => a.id === id);
  const open = ctx.model.editingArtboardId === id && saved !== undefined;
  const config = ctx.model.config;
  ctx.dispatch({ artboards, ...(open ? { metadata: answer.metadata, config: { ...config, banner: { ...config.banner, title: saved.title, subtitle: saved.subtitle } } } : {}) });
  saveArtboards(artboards);
}

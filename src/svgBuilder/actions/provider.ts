// actions/provider.ts — shared Gemini config/key/model check plus the ONE
// confirmed sheet-metadata request. No key or image bytes enter status text.
import { parseGeminiConfig, type GeminiConfig } from "../../lib/upload/gemini";
import { listGeminiModels } from "../../lib/upload/geminimodels";
import { redact } from "../../lib/svgsecret";
import { DEFAULT_ARTBOARD_SUBTITLE, acceptSheetMetadata } from "../../lib/svgBuilder/metadata";
import { iconsImageFor } from "../metaimagefor";
import { saveGeminiConfig } from "../../upload/configstore";
import { clearGeminiKey, readGeminiKey, saveGeminiKey } from "../../upload/keystore";
import { emptyKeyInfo, keyInfoOf } from "../model";
import { generateSheetMetadata } from "../runSheetMetadata";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { editSheetMetadata } from "../../lib/svgBuilder/metadata";
import type { SheetMetadata, SheetMetadataFields } from "../../lib/svgBuilder/types";
import { commitConfig } from "./config";

type ProviderActions = Pick<BuilderActions,
  "setGemini" | "checkModel" | "saveKey" | "forgetKey" | "generateMetadata"
  | "confirmMetadata" | "cancelMetadata" | "acceptMetadataDraft" | "editMetadata" | "acceptMetadata">;

export function providerActions(get: () => BuilderActionContext): ProviderActions {
  return {
    setGemini: (patch) => setGemini(get(), patch),
    checkModel: () => { void checkModel(get()); },
    saveKey: (key) => { void saveKey(get(), key); },
    forgetKey: () => { void forgetKey(get()); },
    generateMetadata: () => { void prepareMetadata(get()); },
    confirmMetadata: () => { void confirmMetadata(get()); },
    cancelMetadata: () => cancelMetadata(get()),
    acceptMetadataDraft: () => acceptDraft(get()),
    editMetadata: (patch) => editMetadata(get(), patch),
    acceptMetadata: () => acceptMetadata(get()),
  };
}

function setGemini(ctx: BuilderActionContext, patch: Partial<GeminiConfig>): void {
  const gemini = parseGeminiConfig({ ...ctx.model.gemini, ...patch });
  ctx.dispatch({ gemini });
  saveGeminiConfig(gemini);
}

async function checkModel(ctx: BuilderActionContext): Promise<void> {
  const key = ctx.model.key.value;
  const model = ctx.model.gemini.model;
  if (key === null || key.trim() === "") return ctx.say("Save the Gemini API key before checking the model", true);
  ctx.dispatch({ modelCheck: { state: "checking", detail: "" } });
  const out = await listGeminiModels({ config: ctx.model.gemini, apiKey: key });
  const found = out.ok && out.ids.includes(model);
  const detail = !out.ok ? `the model check failed — ${redact(out.failure.message, key)}`
    : found ? `the provider lists ${model} (${out.ids.length} model(s) checked)`
      : `the provider does not list ${model} — the model id was NOT changed`;
  ctx.dispatch({ modelCheck: { state: !out.ok ? "failed" : found ? "found" : "missing", detail } });
  ctx.say(detail, !found);
}

async function saveKey(ctx: BuilderActionContext, key: string): Promise<void> {
  const outcome = await saveGeminiKey(key);
  ctx.dispatch({ key: keyInfoOf(await readGeminiKey()) });
  ctx.say(outcome === "device" ? "Gemini API key saved on this device"
    : outcome === "session" ? "Gemini API key kept for this session only" : "No key was changed", outcome === "empty");
}

async function forgetKey(ctx: BuilderActionContext): Promise<void> {
  await clearGeminiKey();
  ctx.dispatch({ key: emptyKeyInfo(), modelCheck: { state: "idle", detail: "" } });
  ctx.say("Gemini API key removed from this device");
}

/** The exact request: the icons of the current sheet (no banner) — or the whole sheet when chosen (2026-11-23) — as one PNG of at most 1 MP (2026-11-14). */
export async function prepareMetadata(ctx: BuilderActionContext, full = ctx.model.prefs.metaFullSheet): Promise<void> {
  if (ctx.document === null) return ctx.say("Compose a sheet before generating metadata", true);
  if (ctx.model.key.value === null) return ctx.say("Save the Gemini API key before generating metadata", true);
  const preview = await iconsImageFor({ config: ctx.model.config, assets: ctx.assets, placedIds: ctx.placedIds, svgTexts: ctx.model.svgTexts, full });
  if (!preview.ok) return ctx.say(`Sheet image failed — ${preview.reason}`, true);
  ctx.dispatch({ preview: preview.dataUrl, dialog: "metadata", draft: null, draftTitle: "",
    status: `Confirm the exact ${full ? "sheet" : "icons"} image and prompt before sending` });
}

async function confirmMetadata(ctx: BuilderActionContext): Promise<void> {
  const key = ctx.model.key.value;
  const preview = ctx.model.preview;
  if (key === null || preview === null) return ctx.say("The exact preview or key is missing — nothing was sent", true);
  ctx.setBusy("Generating sheet metadata…");
  try {
    const out = await generateSheetMetadata({ config: ctx.model.gemini, apiKey: key,
      prompt: ctx.model.prompt, preview });
    if (!out.ok) return ctx.say(`Sheet metadata failed — ${out.reason}`, true);
    applyAnswer(ctx, out.draft, out.artboardTitle, out.truncated);
  } finally {
    ctx.setBusy(null);
  }
}

/**
 * The answer is applied at once (2026-11-15: no draft step): accepted when it
 * passes the upload rules, else kept as invalid with its errors in the editor;
 * its Title-Artboard goes onto the banner; the confirmation closes.
 */
function applyAnswer(ctx: BuilderActionContext, draft: SheetMetadata, artboardTitle: string, truncated: boolean): void {
  const metadata = acceptSheetMetadata(draft);
  ctx.dispatch({ metadata, draft: null, preview: null, dialog: "none" });
  applyArtboardTitle(ctx, ctx.model.prefs.metaTitleToBanner ? artboardTitle : ""); // unticked: only the metadata (2026-11-23)
  const note = truncated ? " (the answer was truncated — check it)" : "";
  ctx.say(metadata.state === "accepted" ? `Sheet metadata applied${note}` : `Sheet metadata saved but invalid — ${metadata.validation?.errors.join("; ")}${note}`, metadata.state !== "accepted");
}

function acceptDraft(ctx: BuilderActionContext): void {
  const draft = ctx.model.draft;
  if (draft === null) return ctx.say("No sheet metadata draft to accept", true);
  const accepted = acceptSheetMetadata(draft);
  if (accepted.state !== "accepted") return ctx.say(`Draft is invalid — ${accepted.validation?.errors.join(" ")}`, true);
  ctx.dispatch({ metadata: accepted, draft: null, preview: null, dialog: "none",
    status: "Sheet metadata accepted — it will be embedded in exports" });
  applyArtboardTitle(ctx, ctx.model.draftTitle);
}

/** The answer's Title-Artboard becomes the visible banner title, the subtitle the default phrase (one undo step). */
function applyArtboardTitle(ctx: BuilderActionContext, title: string): void {
  ctx.dispatch({ draftTitle: "" });
  if (title === "") return;
  const config = ctx.model.config;
  commitConfig(ctx, { config: { ...config, banner: { ...config.banner, title, subtitle: DEFAULT_ARTBOARD_SUBTITLE } }, label: "Title from metadata" });
}

/** Editing the fields (the upload tab's way): an accepted answer turns "edited" until Accept re-validates it. */
function editMetadata(ctx: BuilderActionContext, patch: Partial<SheetMetadataFields>): void {
  ctx.dispatch({ metadata: editSheetMetadata(ctx.model.metadata, patch) });
}

/** ✓ Accept: re-validated with the upload tab's rules; refused with the exact violations. */
function acceptMetadata(ctx: BuilderActionContext): void {
  const current = ctx.model.metadata;
  if (current === null) return ctx.say("No metadata to accept", true);
  const accepted = acceptSheetMetadata(current);
  ctx.dispatch({ metadata: accepted });
  ctx.say(accepted.state === "accepted" ? "Metadata accepted" : `Metadata is invalid — ${accepted.validation?.errors.join("; ")}`, accepted.state !== "accepted");
}

function cancelMetadata(ctx: BuilderActionContext): void {
  ctx.dispatch({ dialog: "none", draft: null, preview: null, status: "Sheet metadata request cancelled — nothing was sent" });
}

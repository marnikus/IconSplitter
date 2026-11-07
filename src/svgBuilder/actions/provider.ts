// actions/provider.ts — shared Gemini config/key/model check plus the ONE
// confirmed sheet-metadata request. No key or image bytes enter status text.
import { parseGeminiConfig, type GeminiConfig } from "../../lib/upload/gemini";
import { listGeminiModels } from "../../lib/upload/geminimodels";
import { redact } from "../../lib/svgsecret";
import { acceptSheetMetadata } from "../../lib/svgBuilder/metadata";
import { saveGeminiConfig } from "../../upload/configstore";
import { clearGeminiKey, readGeminiKey, saveGeminiKey } from "../../upload/keystore";
import { emptyKeyInfo, keyInfoOf } from "../model";
import { sheetPreviewFor } from "../preview";
import { generateSheetMetadata } from "../runSheetMetadata";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type ProviderActions = Pick<BuilderActions,
  "setGemini" | "checkModel" | "saveKey" | "forgetKey" | "generateMetadata"
  | "confirmMetadata" | "cancelMetadata" | "acceptMetadataDraft">;

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

async function prepareMetadata(ctx: BuilderActionContext): Promise<void> {
  const doc = ctx.document;
  if (doc === null) return ctx.say("Compose a sheet before generating metadata", true);
  if (ctx.model.key.value === null) return ctx.say("Save the Gemini API key before generating metadata", true);
  const preview = await sheetPreviewFor(doc.svg);
  if (!preview.ok) return ctx.say(`Sheet preview failed — ${preview.reason}`, true);
  ctx.dispatch({ preview: preview.dataUrl, dialog: "metadata", draft: null,
    status: "Confirm the exact sheet preview and prompt before sending" });
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
    ctx.dispatch({ draft: out.draft, status: out.truncated ? "The provider answer was truncated — review it carefully"
      : "Sheet metadata draft ready — accept it before it enters an export" });
  } finally {
    ctx.setBusy(null);
  }
}

function acceptDraft(ctx: BuilderActionContext): void {
  const draft = ctx.model.draft;
  if (draft === null) return ctx.say("No sheet metadata draft to accept", true);
  const accepted = acceptSheetMetadata(draft);
  if (accepted.state !== "accepted") return ctx.say(`Draft is invalid — ${accepted.validation?.errors.join(" ")}`, true);
  ctx.dispatch({ metadata: accepted, draft: null, preview: null, dialog: "none",
    status: "Sheet metadata accepted — it will be embedded in exports" });
}

function cancelMetadata(ctx: BuilderActionContext): void {
  ctx.dispatch({ dialog: "none", draft: null, preview: null, status: "Sheet metadata request cancelled — nothing was sent" });
}

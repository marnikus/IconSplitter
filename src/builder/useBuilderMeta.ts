// useBuilderMeta.ts — the sheet's metadata: prompt, provider, key, one confirmed
// request, and the record it leaves behind (design §5.6, P6).
//
// Everything shared with "SVG to upload" is genuinely shared, not copied: the
// provider config is the SAME stored object (`upload/configstore`), the key is the
// SAME keyvault slot, and the prompt/validator are the same code. The tab keeps its
// own prompt text and its own preset list, because a sheet prompt is a different
// piece of writing from a single-icon prompt — but the DEFAULT and the rules are
// upload's, so an answer is judged identically in both tabs.
//
// Only a confirmed request is ever sent: the action builds the body, the panel shows
// the disclosure, and the send happens after the user confirms. Nothing here retries
// an outcome-unknown request.

import { useCallback, useEffect, useMemo, useState } from "react";
import { readKey, writeKey } from "../state/safestorage";
import { loadGeminiConfig, saveGeminiConfig } from "../upload/configstore";
import { loadGeminiKey, saveGeminiKey } from "../upload/keystore";
import type { GeminiConfig } from "../lib/upload/gemini";
import { DEFAULT_METADATA_PROMPT } from "../lib/upload/meta";
import { parsePresets, serializePresets, upsertPreset, removePreset, type PromptPreset } from "../lib/promptpresets";
import { buildSheetMetaRequest, sheetMetaFingerprint, type SheetMetaArgs } from "../lib/builder/metarequest";
import { parseMetaRecord, serializeMetaRecord, staleOf, type SheetMetaRecord } from "../lib/builder/metastore";
import { runSheetMeta, type SheetMetaResult } from "./metarun";

/** The tab's own storage, all read-side validated (RULE 13). */
const PROMPT_KEY = "iconSplitter.builder.prompt.v1";
const PRESETS_KEY = "iconSplitter.builder.prompts.v1";
const META_KEY = "iconSplitter.builder.meta.v1";

export interface BuilderMeta {
  prompt: string;
  /** True while the prompt is the shipped default (so the panel can say "saved"). */
  isDefault: boolean;
  presets: PromptPreset[];
  gemini: GeminiConfig;
  keySet: boolean;
  record: SheetMetaRecord | null;
  /** True when `record` describes an EARLIER sheet — never shown as current. */
  stale: boolean;
  busy: string | null;
  /** The disclosure of the body the next request would send. */
  disclosure: SheetMetaRequestView;
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
  savePreset: (name: string) => void;
  pickPreset: (name: string) => void;
  deletePreset: () => void;
  setGemini: (patch: Partial<GeminiConfig>) => void;
  saveKey: (key: string) => void;
  forgetKey: () => void;
  /** Sends the disclosed body once. Returns the outcome for the panel to state. */
  generate: (args: SheetMetaArgs) => Promise<SheetMetaResult>;
  accept: () => void;
}

export interface SheetMetaRequestView {
  mode: "svg" | "digest";
  chars: number;
  icons: number;
  lines: string[];
}

/** The tab's metadata state and its actions. */
export function useBuilderMeta(sheet: SheetMetaArgs): BuilderMeta {
  const local = useMetaState();
  const { sheetSvg, title, subtitle, icons } = sheet;
  // The disclosure follows the sheet and is DERIVED, never an effect: an effect
  // keyed on a freshly built object would re-run every render and loop (P2 lesson).
  const view = useMemo(() => disclosureOf(sheet), [sheetSvg, title, subtitle, icons.length]);
  useEffect(() => { void refreshKey(local.setKeySet); }, []);
  const state = stateOf({ ...local, view, sheet });
  const actions = actionsOf({ ...local, accept: () => markAccepted(local.setRecord) });
  return { ...state, ...actions };
}

/** The hook's own mutable values, in one object so the halves can share them. */
interface MetaState {
  prompt: string; presets: PromptPreset[]; gemini: GeminiConfig; keySet: boolean;
  record: SheetMetaRecord | null; busy: string | null;
  setPrompt: (text: string) => void; setPresets: (list: PromptPreset[]) => void;
  setGeminiState: (config: GeminiConfig) => void; setKeySet: (set: boolean) => void;
  setRecord: (record: SheetMetaRecord) => void; setBusy: (word: string | null) => void;
  generate: (args: SheetMetaArgs) => Promise<SheetMetaResult>;
}

function useMetaState(): MetaState {
  const [prompt, setPromptState] = useState(() => readPrompt());
  const [presets, setPresets] = useState<PromptPreset[]>(() => readPresets());
  const [gemini, setGeminiState] = useState<GeminiConfig>(() => loadGeminiConfig());
  const [keySet, setKeySet] = useState(false);
  const [record, setRecord] = useState<SheetMetaRecord | null>(() => readRecord());
  const [busy, setBusy] = useState<string | null>(null);
  const setPrompt = useCallback((text: string) => {
    setPromptState(text);
    writeKey(PROMPT_KEY, serializePrompt(text));
  }, []);
  const generate = useCallback((args: SheetMetaArgs) => sendSheetMeta(args, gemini, setBusy, setRecord), [gemini]);
  return { prompt, presets, gemini, keySet, record, busy, setPrompt, setPresets, setGeminiState, setKeySet, setRecord, setBusy, generate };
}

/** Loads the shared key's presence into the panel (never the key itself). */
async function refreshKey(setKeySet: (set: boolean) => void): Promise<void> {
  const key = await loadGeminiKey();
  setKeySet(key !== null && key !== "");
}

/** Marks the current record accepted (the user's own decision, stored). */
function markAccepted(setRecord: (record: SheetMetaRecord) => void): void {
  const current = readRecord();
  if (current === null) return;
  const next = { ...current, state: "accepted" as const };
  storeRecord(next, setRecord);
}

/** One confirmed request, with the busy words around it. */
async function sendSheetMeta(
  args: SheetMetaArgs, gemini: GeminiConfig,
  setBusy: (word: string | null) => void, setRecord: (record: SheetMetaRecord) => void,
): Promise<SheetMetaResult> {
  const apiKey = await loadGeminiKey();
  if (apiKey === null || apiKey === "") return noKeyResult();
  setBusy("Asking the provider…");
  try {
    const result = await runSheetMeta({
      request: buildSheetMetaRequest(args), prompt: args.prompt, fingerprint: sheetMetaFingerprint(args), config: gemini, apiKey,
    });
    if (result.record !== null) storeRecord(result.record, setRecord);
    return result;
  } finally {
    setBusy(null);
  }
}

/** What a request without a key reports: nothing was sent, and why. */
function noKeyResult(): SheetMetaResult {
  return {
    outcome: "failed", record: null, metadata: null,
    usage: { input: null, output: null, total: null }, failure: null,
    outcomeUnknown: false, detail: "No Gemini API key is set — open the provider card and paste one",
  };
}

/** The provider's own actions: one stored config, one keyvault slot (shared). */
function providerActions(a: {
  gemini: GeminiConfig; setGeminiState: (config: GeminiConfig) => void; setKeySet: (set: boolean) => void;
}): Pick<BuilderMeta, "setGemini" | "saveKey" | "forgetKey"> {
  return {
    setGemini: (patch) => {
      const next = { ...a.gemini, ...patch };
      a.setGeminiState(next);
      saveGeminiConfig(next);
    },
    saveKey: (key) => { void saveGeminiKey(key).then((out) => a.setKeySet(out !== "empty")); },
    forgetKey: () => a.setKeySet(false),
  };
}

/** The read-only half of the hook's value. */
function stateOf(a: MetaState & { view: SheetMetaRequestView; sheet: SheetMetaArgs }): Pick<BuilderMeta, "prompt" | "isDefault" | "presets" | "gemini" | "keySet" | "record" | "stale" | "busy" | "disclosure"> {
  return {
    prompt: a.prompt,
    isDefault: a.prompt === DEFAULT_METADATA_PROMPT,
    presets: a.presets,
    gemini: a.gemini,
    keySet: a.keySet,
    record: a.record,
    stale: staleOf(a.record, sheetMetaFingerprint(a.sheet)),
    busy: a.busy,
    disclosure: a.view,
  };
}

/** The action half — every one of them writes through the one storage path. */
function actionsOf(a: MetaState & { accept: () => void }): Pick<BuilderMeta, "setPrompt" | "resetPrompt" | "savePreset" | "pickPreset" | "deletePreset" | "setGemini" | "saveKey" | "forgetKey" | "generate" | "accept"> {
  return {
    setPrompt: a.setPrompt,
    resetPrompt: () => a.setPrompt(DEFAULT_METADATA_PROMPT),
    savePreset: (name) => a.setPresets(writeList(upsertPreset(a.presets, name, a.prompt))),
    pickPreset: (name) => {
      const found = a.presets.find((p) => p.name === name);
      if (found !== undefined) a.setPrompt(found.text);
    },
    deletePreset: () => {
      const last = a.presets[a.presets.length - 1];
      if (last !== undefined) a.setPresets(writeList(removePreset(a.presets, last.name)));
    },
    ...providerActions(a),
    generate: a.generate,
    accept: a.accept,
  };
}

/** The disclosure of the sheet as it stands. */
function disclosureOf(sheet: SheetMetaArgs): SheetMetaRequestView {
  return buildSheetMetaRequest(sheet).disclosure;
}

function readPrompt(): string {
  const text = readKey(PROMPT_KEY);
  if (!text) return DEFAULT_METADATA_PROMPT;
  try {
    const raw: unknown = JSON.parse(text);
    const value = typeof raw === "object" && raw !== null ? (raw as { prompt?: unknown }).prompt : null;
    return typeof value === "string" && value.trim() !== "" ? value : DEFAULT_METADATA_PROMPT;
  } catch {
    return DEFAULT_METADATA_PROMPT;
  }
}

function serializePrompt(text: string): string {
  return JSON.stringify({ v: 1, prompt: text });
}

function readPresets(): PromptPreset[] {
  const text = readKey(PRESETS_KEY);
  if (!text) return [];
  try {
    return parsePresets(JSON.parse(text));
  } catch {
    return [];
  }
}

function writeList(list: PromptPreset[]): PromptPreset[] {
  writeKey(PRESETS_KEY, serializePresets(list));
  return list;
}

function readRecord(): SheetMetaRecord | null {
  const text = readKey(META_KEY);
  if (!text) return null;
  try {
    return parseMetaRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function storeRecord(record: SheetMetaRecord, setRecord: (r: SheetMetaRecord) => void): void {
  writeKey(META_KEY, serializeMetaRecord(record));
  setRecord(record);
}

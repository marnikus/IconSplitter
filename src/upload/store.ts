// store.ts — the upload tab's state, owned outside React (RULE 12/13).
// Owns: the picked folder, the rows, the selection, the global defaults, the
// per-icon overrides, the prompt, the provider configuration and the list query.
//
// The durable half (defaults, overrides, prompt, provider) is written to
// localStorage under one versioned key, because that is where the DESIGN puts
// it; the folder handle and the rows are session state and are deliberately not
// persisted — a stale list of files is worse than no list.

import { DEFAULT_GEMINI_CONFIG, parseGeminiConfig, serializeGeminiConfig, type GeminiConfig } from "../lib/geminiconfig";
import type { DirHandleLike } from "../lib/fs";
import { parseMetadataRecord, validateMetadata, type MetadataRecord } from "../lib/uploadmeta";
import { parseOverrideMap, serializeOverrideMap, type OverrideMap } from "../lib/uploadoverride";
import { DEFAULT_METADATA_PROMPT, parseMetadataPrompt } from "../lib/uploadprompt";
import { DEFAULT_UPLOAD_SETTINGS, parseUploadSettings, type UploadSettings } from "../lib/uploadsettings";
import { DEFAULT_QUERY, visibleRows, type ListQuery, type UploadRow } from "./rows";

export const PREFS_STORAGE_KEY = "iconSplitter.upload.settings.v1";

export interface UploadState {
  root: DirHandleLike | null;
  rootName: string;
  rows: UploadRow[];
  activeId: string | null;
  checked: string[];
  settings: UploadSettings;
  overrides: OverrideMap;
  prompt: string;
  provider: GeminiConfig;
  /**
   * Accepted metadata per pair id. `export.json` mirrors it — the record is what
   * a consumer reads, this is what survives a reload when a run has not happened
   * yet. The record wins when the two disagree (see `useUpload`).
   */
  metadata: Record<string, MetadataRecord>;
  list: ListQuery;
  running: boolean;
  /** The activity log this tab shows (time, item, stage, what happened). */
  log: string[];
}

export function initialUploadState(): UploadState {
  const stored = readPrefs();
  return {
    root: null, rootName: "", rows: [], activeId: null, checked: [],
    settings: stored.settings, overrides: stored.overrides,
    prompt: stored.prompt, provider: stored.provider, metadata: stored.metadata,
    list: { ...DEFAULT_QUERY }, running: false, log: [],
  };
}

let state: UploadState = initialUploadState();
const listeners = new Set<() => void>();

export function getUploadState(): UploadState {
  return state;
}

export function subscribeUpload(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The snapshot React compares against; a single object, replaced on change. */
export function uploadSnapshot(): UploadState {
  return state;
}

export function setUploadState(patch: Partial<UploadState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Settings, overrides, prompt and provider change here — and are persisted. */
export function setPrefs(patch: Partial<Pick<UploadState, "settings" | "overrides" | "prompt" | "provider" | "metadata">>): void {
  setUploadState(patch);
  writePrefs({ ...state, ...patch });
}

export function resetUploadStore(): void {
  state = initialUploadState();
  for (const listener of listeners) listener();
}

/** Accepted metadata survives a reload; a malformed entry is dropped, not repaired. */
export function parseMetadataMap(raw: unknown): Record<string, MetadataRecord> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, MetadataRecord> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const record = parseMetadataRecord(value);
    if (id !== "" && record !== null) out[id] = record;
  }
  return out;
}

/** Stores accepted metadata and reports whether it passes validation. */
export function acceptMetadata(id: string, record: MetadataRecord): { ok: boolean; errors: string[] } {
  const check = validateMetadata(record);
  setPrefs({ metadata: { ...state.metadata, [id]: record } });
  return { ok: check.ok, errors: check.errors };
}

/** One line appended to the tab's log — never a secret, never a payload. */
export function note(line: string): void {
  const stamp = new Date().toISOString().slice(11, 19);
  setUploadState({ log: [`${stamp} ${line}`, ...state.log].slice(0, 200) });
}

export function rowsInView(current: UploadState = state): UploadRow[] {
  return visibleRows(current.rows, current.list);
}

export function checkedRows(current: UploadState = state): UploadRow[] {
  const wanted = new Set(current.checked);
  return current.rows.filter((row) => wanted.has(row.id));
}

interface StoredPrefs {
  settings: UploadSettings;
  overrides: OverrideMap;
  prompt: string;
  provider: GeminiConfig;
  metadata: Record<string, MetadataRecord>;
}

function readPrefs(): StoredPrefs {
  const fallback: StoredPrefs = {
    settings: { ...DEFAULT_UPLOAD_SETTINGS }, overrides: {}, prompt: DEFAULT_METADATA_PROMPT,
    provider: serializeGeminiConfig(DEFAULT_GEMINI_CONFIG), metadata: {},
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      settings: parseUploadSettings(parsed.settings),
      overrides: parseOverrideMap(parsed.overrides),
      prompt: parseMetadataPrompt(parsed.prompt),
      provider: parseGeminiConfig(parsed.provider),
      metadata: parseMetadataMap(parsed.metadata),
    };
  } catch {
    return fallback; // a corrupt payload costs one ignored load, never a broken tab
  }
}

function writePrefs(current: UploadState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      settings: current.settings,
      overrides: serializeOverrideMap(current.overrides),
      prompt: current.prompt,
      provider: serializeGeminiConfig(current.provider),
      metadata: current.metadata,
    }));
  } catch {
    // Storage full or blocked: the session still works, it just will not restore.
  }
}

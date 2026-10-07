// useUpload.ts — the SVG-to-upload tab's view state and settings actions
// (RULE 12/13). Owns: subscribing to the store, deriving what the screen shows
// (rows, counts, selection, preflight verdict) and the callbacks the controls
// use. The file system and provider actions live in `useUploadRun.ts`.
//
// It holds no rule of its own: discovery is `svg/sources`, the row model and the
// counts are `upload/rows`, the defaults and their validation are
// `lib/uploadsettings`, and the preflight verdict is `lib/uploadstage`. This is
// the wiring that makes them one screen, so two controls cannot disagree.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DEFAULT_UPLOAD_SETTINGS, settingIssues, type UploadSettings } from "../lib/uploadsettings";
import { preflight, type Preflight } from "../lib/uploadstage";
import { epsRendererAvailable } from "./epsprobe";
import { validateMetadata, type MetadataRecord } from "../lib/uploadmeta";
import { withOverride, type OverrideMap, type OverridePatch } from "../lib/uploadoverride";
import { maskKey } from "../lib/svgsecret";
import { hasApiKey } from "../svg/keystore";
import type { GeminiConfig } from "../lib/geminiconfig";
import { countsOf, visibleRows, type ListQuery, type RowCounts, type UploadRow } from "./rows";
import type { UploadState } from "./store";
import { acceptMetadata, getUploadState, note, setPrefs, setUploadState, subscribeUpload } from "./store";
import { useRunActions, type RunApi } from "./useUploadRun";

export const DEFAULT_ZOOM = 128;

export interface UploadApi extends RunApi {
  rows: UploadRow[];
  shown: UploadRow[];
  counts: RowCounts;
  active: UploadRow | null;
  checked: UploadRow[];
  list: ListQuery;
  settings: UploadSettings;
  overrides: OverrideMap;
  prompt: string;
  provider: GeminiConfig;
  keyMask: string | null;
  log: string[];
  problems: string[];
  preflight: Preflight;
  zoom: number;
  previewBackground: string;
  issues: ReturnType<typeof settingIssues>;
  setList: (patch: Partial<ListQuery>) => void;
  toggleCheck: (id: string, on?: boolean) => void;
  checkVisible: (on: boolean) => void;
  setActive: (id: string) => void;
  setZoom: (px: number) => void;
  setPreviewBackground: (colour: string) => void;
  updateSettings: (patch: Partial<UploadSettings>) => void;
  resetSettings: () => void;
  updateOverride: (id: string, patch: OverridePatch) => void;
  clearOverrideFor: (id: string) => void;
  applyToSelection: (patch: OverridePatch) => void;
  resetSelection: () => void;
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
  updateProvider: (patch: Partial<GeminiConfig>) => void;
  saveKey: (key: string) => Promise<void>;
  saveMetadata: (id: string, record: MetadataRecord) => { ok: boolean; errors: string[] };
}

interface Extra {
  zoom: number;
  previewBackground: string;
  keyMask: string | null;
}

export function useUpload(): UploadApi {
  const state = useSyncExternalStore(subscribeUpload, getUploadState, getUploadState);
  const [extra, setExtra] = useState<Extra>({ zoom: DEFAULT_ZOOM, previewBackground: "#808080", keyMask: null });
  useKeyState(setExtra);
  return {
    ...useRunActions(extra.keyMask),
    ...useDerived(state, extra),
    ...useViewActions(setExtra),
    log: state.log,
  };
}

/** Everything the list header reads, derived once per store change. */
function useDerived(state: UploadState, extra: Extra): Pick<UploadApi,
  "rows" | "shown" | "counts" | "checked" | "active" | "list" | "settings" | "overrides" | "prompt" |
  "provider" | "keyMask" | "zoom" | "previewBackground" | "issues" | "problems" | "preflight"> {
  const shown = useMemo(() => visibleRows(state.rows, state.list), [state.rows, state.list]);
  const counts = useMemo(() => countsOf(state.rows), [state.rows]);
  const checked = useMemo(() => state.rows.filter((row) => state.checked.includes(row.id)), [state.rows, state.checked]);
  const problems = useMemo(() => state.rows.flatMap((row) => row.problems.map((text) => `${row.name}: ${text}`)), [state.rows]);
  const verdict = useMemo(() => preflight({
    folderOpen: state.rootName !== "",
    approved: state.rows.length,
    selected: checked.length,
    needsMetadata: checked.filter((row) => row.metadataCheck?.ok !== true).length,
    wantsEps: state.settings.includeEps,
    epsRenderer: epsRendererAvailable(),
    keyPresent: extra.keyMask !== null,
  }), [state.rootName, state.rows.length, checked, state.settings.includeEps, extra.keyMask]);
  return {
    rows: state.rows, shown, counts, checked,
    active: state.rows.find((row) => row.id === state.activeId) ?? null,
    list: state.list, settings: state.settings, overrides: state.overrides,
    prompt: state.prompt, provider: state.provider, keyMask: extra.keyMask,
    zoom: extra.zoom, previewBackground: extra.previewBackground,
    issues: settingIssues(state.settings), problems, preflight: verdict,
  };
}

type SetExtra = (patch: (prev: Extra) => Extra) => void;

/** Whether a key is stored — never the key itself, so it cannot leak upward. */
function useKeyState(setExtra: SetExtra): void {
  useEffect(() => {
    void hasApiKey().then((present) => setExtra((prev) => (prev.keyMask === null) === present ? prev : { ...prev, keyMask: present ? "••••••••" : null }));
  }, [setExtra]);
}

function useViewActions(setExtra: SetExtra): Pick<UploadApi,
  "setList" | "toggleCheck" | "checkVisible" | "setActive" | "setZoom" | "setPreviewBackground" |
  "updateSettings" | "resetSettings" | "updateOverride" | "clearOverrideFor" | "applyToSelection" |
  "resetSelection" | "setPrompt" | "resetPrompt" | "updateProvider" | "saveKey" | "saveMetadata"> {
  return {
    ...useSelectionActions(setExtra),
    ...useSettingsActions(),
    ...useProviderActions(setExtra),
  };
}

/** Selection and view: the list, the checkboxes and the preview frame. */
function useSelectionActions(setExtra: SetExtra): Pick<UploadApi,
  "setList" | "toggleCheck" | "checkVisible" | "setActive" | "setZoom" | "setPreviewBackground"> {
  const setListAction = useCallback((patch: Partial<ListQuery>) => setUploadState({ list: { ...getUploadState().list, ...patch } }), []);
  const toggleCheck = useCallback((id: string, on?: boolean) => {
    const current = getUploadState().checked;
    const next = on === undefined
      ? (current.includes(id) ? current.filter((each) => each !== id) : [...current, id])
      : (on ? [...new Set([...current, id])] : current.filter((each) => each !== id));
    setUploadState({ checked: next, activeId: id });
  }, []);
  const checkVisible = useCallback((on: boolean) => {
    const state = getUploadState();
    const visible = visibleRows(state.rows, state.list).map((row) => row.id);
    setUploadState({ checked: on ? [...new Set([...state.checked, ...visible])] : state.checked.filter((id) => !visible.includes(id)) });
  }, []);
  const setActive = useCallback((id: string) => setUploadState({ activeId: id }), []);
  const setZoom = useCallback((px: number) => setExtra((prev) => ({ ...prev, zoom: Math.min(440, Math.max(48, Math.round(px))) })), [setExtra]);
  const setPreviewBackground = useCallback((colour: string) => setExtra((prev) => ({ ...prev, previewBackground: colour })), [setExtra]);
  return { setList: setListAction, toggleCheck, checkVisible, setActive, setZoom, setPreviewBackground };
}

/** Settings: the defaults, one icon's overrides, and the bulk actions. */
function useSettingsActions(): Pick<UploadApi,
  "updateSettings" | "resetSettings" | "updateOverride" | "clearOverrideFor" | "applyToSelection" | "resetSelection" | "saveMetadata"> {
  const updateSettings = useCallback((patch: Partial<UploadSettings>) => setPrefs({ settings: { ...getUploadState().settings, ...patch } }), []);
  const resetSettings = useCallback(() => setPrefs({ settings: { ...DEFAULT_UPLOAD_SETTINGS } }), []);
  const updateOverride = useCallback((id: string, patch: OverridePatch) => setPrefs({ overrides: withOverride(getUploadState().overrides, id, patch) }), []);
  const clearOverrideFor = useCallback((id: string) => {
    const map = { ...getUploadState().overrides };
    delete map[id];
    setPrefs({ overrides: map });
  }, []);
  const onSelection = useCallback((each: (map: OverrideMap, id: string) => OverrideMap, line: (count: number) => string) => {
    const state = getUploadState();
    let map = state.overrides;
    for (const id of state.checked) map = each(map, id);
    setPrefs({ overrides: map });
    note(line(state.checked.length));
  }, []);
  const applyToSelection = useCallback((patch: OverridePatch) => {
    onSelection((map, id) => withOverride(map, id, patch), (n) => `settings applied to ${n} icon(s)`);
  }, [onSelection]);
  const resetSelection = useCallback(() => onSelection((map, id) => {
    const next = { ...map };
    delete next[id];
    return next;
  }, (n) => `reset ${n} icon(s) to the defaults`), [onSelection]);
  const saveMetadata = useCallback((id: string, record: MetadataRecord) => acceptMetadata(id, record), []);
  return { updateSettings, resetSettings, updateOverride, clearOverrideFor, applyToSelection, resetSelection, saveMetadata };
}

/** The prompt and the provider: what a paid request will send. */
function useProviderActions(setExtra: SetExtra): Pick<UploadApi, "setPrompt" | "resetPrompt" | "updateProvider" | "saveKey"> {
  const setPrompt = useCallback((text: string) => setPrefs({ prompt: text }), []);
  const resetPrompt = useCallback(() => setPrefs({ prompt: "" }), []);
  const updateProvider = useCallback((patch: Partial<GeminiConfig>) => setPrefs({ provider: { ...getUploadState().provider, ...patch } }), []);
  const saveKey = useCallback(async (key: string) => {
    const value = key.trim();
    const { saveApiKey } = await import("../svg/keystore");
    const ok = await saveApiKey(value);
    setExtra((prev) => ({ ...prev, keyMask: ok && value !== "" ? maskKey(value) : null }));
  }, [setExtra]);
  return { setPrompt, resetPrompt, updateProvider, saveKey };
}

export { validateMetadata };

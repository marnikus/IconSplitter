// actions.ts — what the user can do on the "SVG to upload" tab (RULE 2/4/24).
// Every action is a small hook over one context object: the current model
// snapshot, the dispatch that changes it, the mutable refs (root handle, key,
// aborts, journal) and the shared history. The batch runners live in
// metaactions/exportactions; the selection, dialog and clipboard actions in
// uiactions. This file owns the source, view, settings, provider and key
// actions. Undo policy (design §6): ONE entry type `uploadSettings` — the bulk
// apply and the per-icon override set/reset are undoable; global defaults edits
// are persisted but not undoable (the same class as presets).

import { useCallback, useRef, type Dispatch } from "react";
import type { PreviewBackground } from "../lib/svgbackground";
import { parsePreviewBackground } from "../lib/svgbackground";
import type { GeminiConfig } from "../lib/upload/gemini";
import { parseGeminiConfig } from "../lib/upload/gemini";
import type { IconMetadata } from "../lib/upload/meta";
import {
  normalizeSettings, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import type { HistoryApi } from "../state/HistoryProvider";
import { pickFolderFor } from "../ui/pickroot";
import { clearGeminiKey, loadGeminiKey, saveGeminiKey } from "./keystore";
import type { UploadDiscovery } from "./discovery";
import { rememberRoot } from "./scan";
import type { UploadCounts } from "./rowmodel";
import { useMetaActions } from "./metaactions";
import { usePromptActions, type PromptActions } from "./promptactions";
import { useModelCheckActions } from "./modelcheck";
import { useExportActions } from "./exportactions";
import { useUiActions } from "./uiactions";
import type { UploadAction, UploadModel } from "./statemodel";
import {
  ALL_UPLOAD_FILTER,
  type UploadListFilter, type UploadRow, type UploadSort, type UploadRefs,
} from "./types";

/** Everything an action may touch. One object, passed everywhere. */
export interface UploadCtx {
  m: UploadModel;
  dispatch: Dispatch<UploadAction>;
  refs: UploadRefs;
  hist: HistoryApi;
  rows: UploadRow[];
  visible: UploadRow[];
  checked: string[];
  activeId: string | null;
  header: "none" | "some" | "all";
  counts: UploadCounts;
  say: (msg: string, err?: boolean) => void;
  loadAll: () => void;
  setRootName: (name: string) => void;
  setDiscovery: (d: UploadDiscovery | null) => void;
  setBusy: (b: string | null) => void;
}

/**
 * The public action surface of the tab, in the order the panel uses them. The
 * prompt panel's gestures are part of it (promptactions owns their rules), so
 * the panel reads ONE surface and never reaches into a store.
 */
export interface UploadActions extends PromptActions {
  chooseRoot: () => void;
  rescan: () => void;
  setThumb: (px: number) => void;
  setBg: (bg: PreviewBackground) => void;
  setProviderOpen: (open: boolean) => void;
  setFilter: (patch: Partial<UploadListFilter>) => void;
  setSort: (sort: UploadSort) => void;
  clearFilters: () => void;
  setDefaults: (patch: Partial<UploadSettings>) => void;
  setOverride: (id: string, patch: SettingsOverrides) => void;
  resetOverride: (id: string) => void;
  applyDefaultsToSelected: (ids: string[]) => void;
  setGemini: (patch: Partial<GeminiConfig>) => void;
  checkModel: () => void;
  saveKey: (key: string) => void;
  forgetKey: () => void;
  toggleCheck: (id: string) => void;
  selectVisible: () => void;
  deselectAll: () => void;
  setActive: (id: string) => void;
  openSettings: (id: string | null) => void;
  dismissDialog: () => void;
  requestMetadata: (ids: string[]) => void;
  confirmMetadata: () => void;
  cancelMetadata: () => void;
  acceptMetadata: (id: string) => void;
  editMetadata: (id: string, patch: Partial<IconMetadata>) => void;
  copyMeta: (id: string, field: "title" | "description" | "tags") => void;
  exportRows: (ids: string[]) => void;
  exportRow: (id: string) => void;
  cancelExport: () => void;
  openLocation: (id: string) => void;
}

/** One hook's share of the action surface, so the composition stays typed. */
export type Slice<K extends keyof UploadActions> = Pick<UploadActions, K>;

export function useUploadActions(ctx: UploadCtx): UploadActions {
  return {
    ...useSourceActions(ctx),
    ...useViewActions(ctx),
    ...useDefaultsActions(ctx),
    ...useOverrideActions(ctx),
    ...useOverrideResetActions(ctx),
    ...useOverrideApplyActions(ctx),
    ...useGeminiActions(ctx),
    ...useModelCheckActions(ctx),
    ...useKeyActions(ctx),
    ...useUiActions(ctx),
    ...useMetaActions(ctx),
    ...useExportActions(ctx),
    ...usePromptActions(ctx),
  };
}

function useSourceActions(ctx: UploadCtx): Slice<"chooseRoot" | "rescan"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const chooseRoot = useCallback(() => {
    void (async () => {
      const c = latest.current;
      const picked = await pickFolderFor((h) => {
        c.refs.root.current = h;
        c.dispatch({ type: "root", name: h.name });
        void rememberRoot(h);
      });
      if (!picked) return c.say("Folder picking needs Chrome or Edge — or was cancelled", true);
      c.loadAll();
      c.say(picked.message ?? `Approved SVGs scanned from ${picked.handle.name}`);
    })();
  }, []);
  const rescan = useCallback(() => latest.current.loadAll(), []);
  return { chooseRoot, rescan };
}

function useViewActions(ctx: UploadCtx): Slice<"setThumb" | "setBg" | "setProviderOpen" | "setFilter" | "setSort" | "clearFilters"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setThumb = useCallback((px: number) => latest.current.dispatch({ type: "thumb", px }), []);
  // validated on the way in as well as on the way out (RULE 13)
  const setBg = useCallback((bg: PreviewBackground) => latest.current.dispatch({ type: "bg", bg: parsePreviewBackground(bg) }), []);
  const setProviderOpen = useCallback((open: boolean) => latest.current.dispatch({ type: "provider-open", open }), []);
  const setFilter = useCallback((patch: Partial<UploadListFilter>) => latest.current.dispatch({ type: "filter", patch }), []);
  const setSort = useCallback((sort: UploadSort) => latest.current.dispatch({ type: "sort", sort }), []);
  const clearFilters = useCallback(() => latest.current.dispatch({ type: "filter", patch: ALL_UPLOAD_FILTER }), []);
  return { setThumb, setBg, setProviderOpen, setFilter, setSort, clearFilters };
}

/** Global defaults: persisted, never on the undo timeline (design §6). */
function useDefaultsActions(ctx: UploadCtx): Slice<"setDefaults"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setDefaults = useCallback((patch: Partial<UploadSettings>) => {
    const c = latest.current;
    const defaults = normalizeSettings({ ...c.m.defaults, ...patch });
    c.dispatch({ type: "defaults", defaults });
  }, []);
  return { setDefaults };
}

/** One field pinned per icon — a gesture-coalesced undo entry per drag. */
function useOverrideActions(ctx: UploadCtx): Slice<"setOverride"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setOverride = useCallback((id: string, patch: SettingsOverrides) => {
    const c = latest.current;
    const before = c.m.overrides[id] ?? null;
    const after = Object.keys(patch).length === 0 ? null : patch;
    if (before === after) return;
    c.dispatch({ type: "override", id, patch: after });
    // One gesture-coalesced entry: a slider drag is one undo, not forty.
    c.hist.pushGesture({
      type: "uploadSettings",
      label: `Override settings — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before } }, after: { overrides: { [id]: after } },
    });
  }, []);
  return { setOverride };
}

/** Reset one icon to the defaults — one undoable entry. */
function useOverrideResetActions(ctx: UploadCtx): Slice<"resetOverride"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const resetOverride = useCallback((id: string) => {
    const c = latest.current;
    const before = c.m.overrides[id] ?? null;
    if (before === null) return c.say("This icon already inherits the defaults");
    c.dispatch({ type: "override", id, patch: null });
    c.hist.push({
      type: "uploadSettings",
      label: `Reset to defaults — ${nameOf(c, id)}`,
      origin: "upload", ids: [id],
      before: { overrides: { [id]: before } }, after: { overrides: { [id]: null } },
    });
    c.say("Reset to defaults — the icon inherits the global settings again");
  }, []);
  return { resetOverride };
}

/** Apply the current defaults to the selection — ONE undoable entry. */
function useOverrideApplyActions(ctx: UploadCtx): Slice<"applyDefaultsToSelected"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const applyDefaultsToSelected = useCallback((ids: string[]) => {
    const c = latest.current;
    if (ids.length === 0) return c.say("Select at least one icon first", true);
    const before: Record<string, SettingsOverrides | null> = {};
    const after: Record<string, SettingsOverrides | null> = {};
    for (const id of ids) {
      before[id] = c.m.overrides[id] ?? null;
      after[id] = { ...c.m.defaults };
    }
    c.dispatch({ type: "overrides-patch", overrides: after });
    c.hist.push({
      type: "uploadSettings",
      label: `Apply settings to ${ids.length} icon${ids.length === 1 ? "" : "s"}`,
      origin: "upload", ids,
      before: { overrides: before }, after: { overrides: after },
    });
    c.say(`Settings applied to ${ids.length} icon${ids.length === 1 ? "" : "s"} — one undo reverses the whole batch`);
  }, []);
  return { applyDefaultsToSelected };
}

/** The provider config (persisted locally, validated on read). */
function useGeminiActions(ctx: UploadCtx): Slice<"setGemini"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const setGemini = useCallback((patch: Partial<GeminiConfig>) => {
    const c = latest.current;
    const gemini = parseGeminiConfig({ ...c.m.gemini, ...patch });
    c.dispatch({ type: "gemini", gemini });
  }, []);
  return { setGemini };
}

/** The API key: IndexedDB secrets, masked in the UI, never logged (RULE 20). */
function useKeyActions(ctx: UploadCtx): Slice<"saveKey" | "forgetKey"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const saveKey = useCallback((key: string) => {
    void (async () => {
      const c = latest.current;
      const persisted = await saveGeminiKey(key);
      const stored = await loadGeminiKey();
      c.refs.key.current = stored;
      c.dispatch({ type: "key", key: stored });
      c.say(persisted
        ? "Gemini API key stored on this device"
        : "Gemini API key kept for this session only — storage refused the write", !persisted);
    })();
  }, []);
  const forgetKey = useCallback(() => {
    void (async () => {
      const c = latest.current;
      await clearGeminiKey();
      c.refs.key.current = null;
      c.dispatch({ type: "key", key: null });
      c.say("Gemini API key cleared from this device");
    })();
  }, []);
  return { saveKey, forgetKey };
}

/** The row's display name for history labels — its file name, else the id. */
function nameOf(c: UploadCtx, id: string): string {
  return c.rows.find((r) => r.source.id === id)?.source.svgName ?? id;
}

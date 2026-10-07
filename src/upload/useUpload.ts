// useUpload.ts — the SVG-to-upload tab's orchestration (RULE 2/4/5/24). Thin
// on purpose: the rules live in tested modules — discovery in upload/sources,
// the model in upload/statemodel, persistence in upload/stores, the job in
// upload/runner (+ browserdeps), the gestures in upload/uploadactions, the
// undo path in upload/undoable. This hook owns only the wiring: the state,
// the boot/scan effects, the root handle, and the flat API the panel reads.
// The sub-hooks mirror useSelection/useBatch: each is small enough to read at
// a glance, and everything unstable reaches the closures through refs.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import { fsSupported } from "../batch/picker";
import { pickFolderFor } from "../ui/pickroot";
import { loadHandles, saveHandles } from "../batch/store";
import { log } from "../log/logstore";
import { useAppState } from "../state/useAppState";
import { useHistory, type HistoryApi } from "../state/HistoryProvider";
import { patchUpload, type AppState } from "../state/appstore";
import type { ExportOverride, ExportSettings } from "../lib/upsettings";
import type { GeminiConfig } from "../lib/gemconfig";
import type { IconMetadata } from "../lib/upmeta";
import { pruneIds } from "../lib/session";
import { discoverUploadRows, type UploadRowSource } from "./sources";
import { scanExportDir } from "./exportio";
import { makeJournalStore } from "./jobjournal";
import { makeSourceSha } from "./browserdeps";
import { bindUploadSettingsApplier, setOverridesAction, type UploadSettingsPatch } from "./undoable";
import {
  loadGeminiConfig, loadMetaPrompt, loadUploadDefaults, loadUploadOverrides,
  saveUploadDefaults, saveUploadOverrides,
} from "./stores";
import { loadGeminiKey } from "./gemkey";
import { INITIAL_UPLOAD_MODEL, uploadReducer, visibleRows, type UploadAction, type UploadModel } from "./statemodel";
import {
  acceptRowMeta, applyToSelected, checkAllIds, requestPreviewOf, runExport, saveKeyOnDevice,
  setDefaultField, setGeminiField, setPromptText, toggleChecked,
  type LatestState, type RunState, type Say, type UploadCtx,
} from "./uploadactions";

const UPLOAD_HANDLE_KEY = "__upload__";

export interface UploadApi {
  supported: boolean;
  m: UploadModel;
  visible: ReturnType<typeof visibleRows>;
  checked: string[];
  key: string | null;
  rootName: string;
  busy: string | null;
  gemini: GeminiConfig;
  prompt: string;
  say: (msg: string, err?: boolean) => void;
  chooseRoot: () => void;
  rescan: () => void;
  toggleCheck: (id: string) => void;
  checkAll: (ids: string[], on: boolean) => void;
  setDefault: (field: keyof ExportSettings, value: string | boolean) => void;
  applyToSelected: (fields: ExportOverride) => void;
  clearOverride: (id: string) => void;
  setGemini: (patch: Partial<GeminiConfig>) => void;
  setPrompt: (text: string) => void;
  saveKey: (key: string) => void;
  acceptMeta: (row: UploadRowSource, meta: IconMetadata) => void;
  requestPreview: (row: UploadRowSource) => string | null;
  exportSelected: (allowAi: boolean) => Promise<void>;
  cancelRun: () => void;
}

/** The hook's own state bundle — everything the sub-hooks and gestures need. */
interface UploadCore {
  model: UploadModel;
  app: AppState;
  hist: HistoryApi;
  latest: { current: LatestState };
  run: { current: RunState };
  dispatch: Dispatch<UploadAction>;
  say: Say;
  key: string | null;
  rootName: string;
  busy: string | null;
  gemini: GeminiConfig;
  prompt: string;
  setRootName: (n: string) => void;
  setKeyState: (k: string | null) => void;
  setBusy: (b: string | null) => void;
  setGeminiState: (g: GeminiConfig) => void;
  setPromptState: (t: string) => void;
}

export function useUpload(): UploadApi {
  const core = useUploadCore();
  const scan = useUploadScan(core);
  useUploadBoot(core, scan);
  useUploadWiring(core);
  const ctx: UploadCtx = { ...core, scan, chooseRoot: useChooseRoot(core, scan) };
  const api = buildUploadApi(ctx);
  const visible = useMemo(() => visibleRows(core.model), [core.model]);
  return { ...api, supported: fsSupported(), m: core.model, visible, checked: core.app.upload.checked,
    rootName: core.rootName, busy: core.busy, key: core.key, gemini: core.gemini, prompt: core.prompt };
}

/** All state in one place: the reducer, the live snapshot ref, the run flags. */
function useUploadCore(): UploadCore {
  const [model, dispatch] = useReducer(uploadReducer, INITIAL_UPLOAD_MODEL, bootModel);
  const app = useAppState();
  const hist = useHistory();
  const [key, setKeyState] = useState<string | null>(null);
  const [rootName, setRootName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [gemini, setGeminiState] = useState<GeminiConfig>(() => loadGeminiConfig());
  const [prompt, setPromptState] = useState<string>(() => loadMetaPrompt());
  const latest = useRef({ model, rootName, key, gemini, prompt, app });
  latest.current = { model, rootName, key, gemini, prompt, app };
  const run = useRef({ root: null as import("../lib/fs").DirHandleLike | null, cancelled: false, running: false });
  const say = useCallback((msg: string, err = false) => {
    dispatch({ type: "toast", message: err ? `${msg}` : msg });
    window.setTimeout(() => dispatch({ type: "toast", message: null }), 4200);
  }, []);
  return { model, app, hist, latest, run, dispatch, say, key, rootName, busy, gemini, prompt,
    setRootName, setKeyState, setBusy, setGeminiState, setPromptState };
}

/** The scan as a stable callback: every dependency is a ref or a setter. */
function useUploadScan(core: UploadCore): () => Promise<void> {
  const { latest, run, dispatch, setBusy, say } = core;
  return useCallback(
    () => scanOnce({ latest, run, dispatch, setBusy, say }),
    [latest, run, dispatch, setBusy, say],
  );
}

/** Boot: the remembered root (this tab's handle, else the SVG/Selection one). */
function useUploadBoot(core: UploadCore, scan: () => Promise<void>): void {
  const { run, setRootName, setKeyState } = core; // all stable: refs and setters
  useEffect(() => {
    void (async () => {
      const stored = (await loadHandles(UPLOAD_HANDLE_KEY))?.source
        ?? (await loadHandles("__svg__"))?.source
        ?? (await loadHandles("__selection__"))?.source
        ?? null;
      if (stored === null) return;
      run.current.root = stored;
      setRootName(stored.name);
      setKeyState(await loadGeminiKey());
      await scan();
    })();
  }, [run, setRootName, setKeyState, scan]);
}

/** One writer per persisted value, plus the cross-tab undo path (RULE 12). */
function useUploadWiring(core: UploadCore): void {
  const { dispatch, model } = core;
  useEffect(() => bindUploadSettingsApplier((patch) => {
    dispatch(setOverridesAction(patch));
    return true;
  }), [dispatch]);
  useEffect(() => saveUploadDefaults(model.defaults), [model.defaults]);
  useEffect(() => saveUploadOverrides(model.overrides), [model.overrides]);
}

function useChooseRoot(core: UploadCore, scan: () => Promise<void>): () => void {
  return () => void chooseRoot(core, scan);
}

/** One scan of the root: discovery, checked pruning, honest reporting. */
async function scanOnce(p: {
  latest: { current: LatestState }; run: { current: RunState };
  dispatch: Dispatch<UploadAction>; setBusy: (b: string | null) => void; say: Say;
}): Promise<void> {
  const handle = p.run.current.root;
  if (handle === null) return;
  p.setBusy("Scanning approved sources…");
  try {
    const journal = makeJournalStore(handle);
    const found = await discoverUploadRows(handle, (dirPath) => scanExportDir(handle, dirPath), {
      recovery: { read: (dirPath) => journal.load(dirPath), write: (dirPath, j) => journal.save(dirPath, j) },
      sourceSha: makeSourceSha(handle),
    });
    p.dispatch({ type: "scan", rows: found.rows });
    const known = new Set(found.rows.map((r) => r.id));
    patchUpload({ checked: pruneIds(p.latest.current.app.upload.checked, known) });
    reportScan(found, p.say);
    log({ feature: "upload", action: "scan", detail: `${found.rows.length} exportable icon(s)`, data: { rows: found.rows.length, noApprovedSvg: found.noApprovedSvg.length } });
  } catch {
    p.say("Rescan failed — the folder may be unreadable", true);
  } finally {
    p.setBusy(null);
  }
}

async function chooseRoot(core: UploadCore, scan: () => Promise<void>): Promise<void> {
  const picked = await pickFolderFor((h) => {
    core.run.current.root = h;
    core.setRootName(h.name);
    void saveHandles(UPLOAD_HANDLE_KEY, { source: h });
  });
  if (!picked) return core.say("Folder picking needs Chrome or Edge — or was cancelled", true);
  await scan();
  core.say(picked.message ?? `Approved sources scanned from ${picked.handle.name}`);
}

/** The flat API the panel reads — every entry delegates to uploadactions. */
function buildUploadApi(ctx: UploadCtx): Omit<UploadApi,
  "supported" | "m" | "visible" | "checked" | "rootName" | "busy" | "key" | "gemini" | "prompt"> {
  return {
    say: ctx.say,
    chooseRoot: ctx.chooseRoot,
    rescan: () => void ctx.scan(),
    toggleCheck: (id) => toggleChecked(ctx, id),
    checkAll: (ids, on) => checkAllIds(ctx, ids, on),
    setDefault: (field, value) => setDefaultField(ctx, field, value),
    applyToSelected: (fields) => applyToSelected(fields, ctx),
    clearOverride: (id) => ctx.dispatch({ type: "clear-override", id }),
    setGemini: (patch) => setGeminiField(ctx, patch),
    setPrompt: (text) => setPromptText(ctx, text),
    saveKey: (k) => saveKeyOnDevice(ctx, k),
    acceptMeta: (row, meta) => acceptRowMeta(ctx, row, meta),
    requestPreview: (row) => requestPreviewOf(ctx, row),
    exportSelected: (allowAi) => runExport(allowAi, ctx),
    cancelRun: () => { ctx.run.current.cancelled = true; },
  };
}

function bootModel(): UploadModel {
  return {
    ...INITIAL_UPLOAD_MODEL,
    defaults: loadUploadDefaults(),
    overrides: loadUploadOverrides(),
  };
}

function reportScan(found: { rows: UploadRowSource[]; noApprovedSvg: { id: string }[]; unreadable: unknown[] }, say: Say): void {
  const warnings: string[] = [];
  if (found.noApprovedSvg.length > 0) warnings.push(`${found.noApprovedSvg.length} approved pair(s) have no approved SVG version — not listed`);
  const missing = found.rows.filter((r) => r.warnings.length > 0).length;
  if (missing > 0) warnings.push(`${missing} listed icon(s) need attention — the reason is on the row`);
  for (const w of warnings) say(w, true);
}

export type { UploadSettingsPatch };

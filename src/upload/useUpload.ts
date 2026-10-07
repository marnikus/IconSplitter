// useUpload.ts — "SVG to upload" orchestration (RULE 2/4/5/24).
// Thin on purpose: the rules live in tested modules — discovery in
// upload/discovery, the scan in upload/scan, row assembly in upload/rowmodel,
// the model in upload/statemodel, the actions in upload/actions + runs, the
// stores in upload/*store, the undo binding in upload/uploadundo. This file
// owns only the wiring: one reducer for the model, one context object for the
// actions, the boot/persist effects, the derived lists and the flat API the
// panel reads.

import { useCallback, useEffect, useMemo, useRef, type Dispatch } from "react";
import { fsSupported } from "../batch/picker";
import type { DirHandleLike } from "../lib/fs";
import { SCAN_IDLE } from "../lib/scanseq";
import { useAppState } from "../state/useAppState";
import { useHistory } from "../state/HistoryProvider";
import { loadGeminiConfig, saveGeminiConfig } from "./configstore";
import { loadGeminiKey } from "./keystore";
import { log } from "../log/logstore";
import { interruptedIds, takeRestoreNote } from "./jobstore";
import { restoredSpec } from "./uploadlog";
import { createStoredJournal } from "./journal";
import { bootRoot, scanUpload, type UploadScanSetters } from "./scan";
import { loadUploadPrefs, saveUploadPrefs } from "./prefsstore";
import { assembleRows, countsOf, pruneChecked, type UploadCounts } from "./rowmodel";
import { headerState, visibleRows } from "./rowlist";
import { loadUploadSettings, saveUploadSettings } from "./settingsstore";
import { useUploadActions, type UploadActions, type UploadCtx } from "./actions";
import { loadPresets, loadPrompt, savePrompt } from "./promptstore";
import { bindUploadSettingsApplier } from "./uploadundo";
import { useUploadModel, type Boot, type UploadAction, type UploadModel } from "./statemodel";
import type { UploadDiscovery, UploadRowSource } from "./discovery";
import type { UploadRefs, UploadRow } from "./types";

/** What the panel sees: the model plus every action, flattened (RULE 24). */
export type UploadApi = UploadModel & UploadActions & {
  supported: boolean;
  checked: string[];
  activeId: string | null;
  header: "none" | "some" | "all";
  visible: UploadRow[];
  counts: UploadCounts;
  refs: UploadRefs;
  dispatch: Dispatch<UploadAction>;
};

export function useUpload(): UploadApi {
  const boot = useRef(loadBoot()).current;
  const [model, dispatch] = useUploadModel(boot);
  const hist = useHistory();
  const app = useAppState();
  const refs = useRef(newRefs()).current;
  const say = useSay(dispatch);
  const loadAll = useLoadAll(refs, dispatch, say, model);
  const derived = useDerived(model, app.upload.checked);
  const setRootName = useCallback((name: string) => dispatch({ type: "root", name }), [dispatch]);
  const setDiscovery = useCallback((d: UploadDiscovery | null) => dispatch({ type: "discovery", discovery: d }), [dispatch]);
  const setBusy = useCallback((b: string | null) => dispatch({ type: "busy", busy: b }), [dispatch]);
  const ctx: UploadCtx = {
    m: model, dispatch, refs, hist,
    rows: model.rows, visible: derived.visible, checked: app.upload.checked,
    activeId: app.upload.activeId, header: derived.header, counts: derived.counts,
    say, loadAll, setRootName, setDiscovery, setBusy,
  };
  const actions = useUploadActions(ctx);
  useBoot(refs, dispatch, loadAll);
  usePersist(model);
  useUndoBinding(dispatch);
  return {
    ...model, ...actions, supported: fsSupported(),
    checked: app.upload.checked, activeId: app.upload.activeId,
    header: derived.header, visible: derived.visible, counts: derived.counts,
    refs, dispatch,
  };
}

/** A toast lives for a few seconds and then clears itself (RULE 9). */
function useSay(dispatch: Dispatch<UploadAction>): (msg: string, err?: boolean) => void {
  return useCallback((msg: string, err = false) => {
    dispatch({ type: "toast", toast: { msg, err } });
    window.setTimeout(() => dispatch({ type: "toast", toast: null }), 4200);
  }, [dispatch]);
}

/**
 * The scan bridge: scanUpload commits the discovered SOURCES; this hook then
 * assembles the UI rows (export.json + source hash per pair) and commits those
 * once. The snapshot key inside scanUpload still makes an unchanged scan a
 * no-op.
 */
function useLoadAll(
  refs: UploadRefs, dispatch: Dispatch<UploadAction>, say: (m: string, e?: boolean) => void, model: UploadModel,
): () => void {
  const modelRef = useRef(model);
  modelRef.current = model;
  const setters = useMemo<UploadScanSetters>(() => ({
    setRootName: (name) => dispatch({ type: "root", name }),
    setRows: (sources) => { void assembleAndCommit(refs, dispatch, modelRef, sources); },
    setDiscovery: (d) => dispatch({ type: "discovery", discovery: d }),
    setBusy: (b) => dispatch({ type: "busy", busy: b }),
    say,
  }), [dispatch, refs, say]);
  return useCallback(() => {
    const root = refs.root.current as DirHandleLike | null;
    if (root === null) return;
    void scanUpload(refs, root, setters);
  }, [refs, setters]);
}

/** Reads every pair's record + source hash, then commits the assembled rows. */
async function assembleAndCommit(
  refs: UploadRefs, dispatch: Dispatch<UploadAction>,
  modelRef: { current: UploadModel }, sources: UploadRowSource[],
): Promise<void> {
  const root = refs.root.current as DirHandleLike | null;
  if (root === null) return;
  const interrupted = new Set(refs.journal.current.pending().map((e) => e.rowId));
  const interruptedJobs = new Set(interruptedIds());
  const m = modelRef.current;
  const rows = await assembleRows(root, sources, {
    defaults: m.defaults, overrides: m.overrides, interrupted, interruptedJobs,
  });
  dispatch({ type: "rows", rows });
  pruneChecked(rows);
}

/** Once per mount: the stored key, then the remembered root (this tab's, else svg's, else selection's). */
function useBoot(refs: UploadRefs, dispatch: Dispatch<UploadAction>, loadAll: () => void): void {
  useEffect(() => {
    void (async () => {
      reportRestore(dispatch);
      const key = await loadGeminiKey();
      refs.key.current = key;
      dispatch({ type: "key", key });
      const stored = await bootRoot();
      if (stored === null) return;
      refs.root.current = stored;
      dispatch({ type: "root", name: stored.name });
      loadAll();
    })();
  }, [refs, dispatch, loadAll]);
}

/**
 * The restart note (CP-2): work that was in flight when the app closed is
 * reported ONCE per page load and never re-sent. `takeRestoreNote` owns the
 * guard, so StrictMode's double-invoke, a remount or a second panel cannot
 * produce a second entry; it also flips every in-flight job to `interrupted`.
 */
function reportRestore(dispatch: Dispatch<UploadAction>): void {
  const count = takeRestoreNote();
  if (count === null) return;
  log(restoredSpec(count));
  dispatch({ type: "toast", toast: { msg: `${count} icon${count === 1 ? "" : "s"} did not finish before the app closed — nothing was sent again`, err: true } });
  window.setTimeout(() => dispatch({ type: "toast", toast: null }), 6000);
}

/** Settings, provider config and view prefs are remembered locally (RULE 6). */
function usePersist(model: UploadModel): void {
  useEffect(() => {
    saveUploadSettings({ defaults: model.defaults, overrides: model.overrides });
  }, [model.defaults, model.overrides]);
  useEffect(() => saveGeminiConfig(model.gemini), [model.gemini]);
  // The prompt is text the user owns: every keystroke persists (RULE 13).
  useEffect(() => savePrompt(model.prompt), [model.prompt]);
  useEffect(() => {
    saveUploadPrefs({ thumbHeight: model.thumb, providerOpen: model.providerOpen, previewBg: model.bg });
  }, [model.thumb, model.providerOpen, model.bg]);
}

/** A mounted panel claims the uploadSettings undo path; unmount releases it. */
function useUndoBinding(dispatch: Dispatch<UploadAction>): void {
  useEffect(() => bindUploadSettingsApplier((patch) => {
    dispatch({ type: "overrides-patch", overrides: patch.overrides });
  }), [dispatch]);
}

/** The filtered/sorted view, its header state and the counts, derived only. */
function useDerived(model: UploadModel, checked: string[]): {
  visible: UploadRow[]; header: "none" | "some" | "all"; counts: UploadCounts;
} {
  const visible = useMemo(() => visibleRows(model.rows, model.filter, model.sort), [model.rows, model.filter, model.sort]);
  const header = useMemo(() => headerState(visible, checked), [visible, checked]);
  const counts = useMemo(() => countsOf(model.rows), [model.rows]);
  return { visible, header, counts };
}

/** Values the tab opens with, read once from local storage (RULE 6). */
function loadBoot(): Boot {
  return {
    settings: loadUploadSettings(), gemini: loadGeminiConfig(), prefs: loadUploadPrefs(),
    prompt: loadPrompt(), presets: loadPresets(),
  };
}

function newRefs(): UploadRefs {
  return {
    root: { current: null }, key: { current: null },
    abortMeta: { current: null }, abortExport: { current: null },
    journal: { current: createStoredJournal() },
    scanKey: { current: null }, seq: SCAN_IDLE,
  };
}

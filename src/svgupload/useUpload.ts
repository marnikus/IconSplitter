// useUpload.ts — the state the SVG-to-upload panel needs, in one hook (design §2).
// Discovery is the SAME scan the Generate SVG tab runs (approved pairs only, and
// every file's size:mtime so a missing or changed source is visible), rows come
// from lib/svgupload/rows, the view rules from lib/svgupload/view, and the
// settings from their store with their undo bookkeeping in settingsactions.
// Keeping this out of the component is what lets the panel stay composition and
// the rules stay testable without a DOM.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { loadHandles, saveHandles } from "../batch/store";
import { readSvgText } from "../svg/svgfiles";
import { SVG_HANDLE_KEY } from "../svg/reviewundo";
import { discoverApprovedSources } from "../svg/sources";
import { pickRootWithPath } from "../ui/pickroot";
import { useHistory } from "../state/HistoryProvider";
import { DEFAULT_PREVIEW_BACKGROUND, type PreviewBackground } from "../lib/svgbackground";
import { ZOOM_DEFAULT } from "../lib/zoom";
import { buildUploadRows, type UploadRow } from "../lib/svgupload/rows";
import {
  effectiveSettings, parseUploadSettings, setDefault, type UploadDefaults, type UploadSettings,
} from "../lib/svgupload/settings";
import { DEFAULT_UPLOAD_VIEW, uploadCounts, visibleUploadRows, type UploadView } from "../lib/svgupload/view";
import { applyToSelection, resetSelection } from "./settingsactions";
import { getUploadSettings, setUploadSettings, subscribeUploadSettings } from "./settingsstore";

export interface UploadApi {
  root: DirHandleLike | null;
  rows: UploadRow[];
  visible: UploadRow[];
  counts: ReturnType<typeof uploadCounts>;
  busy: string | null;
  toast: string | null;
  checked: string[];
  activeId: string | null;
  view: UploadView;
  zoom: number;
  background: PreviewBackground;
  codes: Record<string, string>;
  defaults: UploadDefaults;
  chooseRoot: () => void;
  rescan: () => void;
  dismissToast: () => void;
  setView: (view: UploadView) => void;
  setZoom: (px: number) => void;
  setBackground: (bg: PreviewBackground) => void;
  setActive: (id: string) => void;
  toggleCheck: (id: string, on: boolean) => void;
  toggleAll: (on: boolean) => void;
  loadCode: (relPath: string) => void;
  changeDefaults: (patch: Partial<UploadDefaults>) => void;
  applySelection: () => void;
  resetRows: (ids: string[]) => void;
  inheritedFor: (id: string) => boolean;
}

export function useUpload(): UploadApi {
  const settings = useUploadSettings();
  const scan = useScan();
  const ui = useListState();
  const derived = useDerivedRows(scan.rows, ui.view);
  const loadCode = useCodeCache(scan.root, ui.codes, ui.setCodes);
  const acts = useUploadActions(scan, ui, settings);
  return {
    ...scan, ...ui, loadCode, ...acts,
    defaults: settings.defaults, counts: derived.counts, visible: derived.visible,
    inheritedFor: useCallback((id: string) => effectiveSettings(settings, id).origin.outputScale === "default", [settings]),
  };
}

/** The list's local choices: selection, active row, view, zoom, preview colour. */
function useListState() {
  const [checked, setChecked] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<UploadView>(DEFAULT_UPLOAD_VIEW);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [background, setBackground] = useState<PreviewBackground>(DEFAULT_PREVIEW_BACKGROUND);
  const [codes, setCodes] = useState<Record<string, string>>({});
  return {
    checked, activeId, view, zoom, background, codes, setView, setZoom, setBackground,
    setActive: setActiveId, setChecked, setCodes,
    toggleCheck: (id: string, on: boolean) => setChecked((ids) => toggle(ids, id, on)),
  };
}

/** Counts and the visible slice — the two derivations the panel renders. */
function useDerivedRows(rows: UploadRow[], view: UploadView) {
  const counts = useMemo(() => uploadCounts(rows), [rows]);
  const visible = useMemo(() => visibleUploadRows(rows, view), [rows, view]);
  return { counts, visible };
}

/** The three writers: defaults, apply-to-selection (one undo), reset. */
function useUploadActions(scan: ReturnType<typeof useScan>, ui: ReturnType<typeof useListState>, settings: UploadSettings) {
  const hist = useHistory();
  const changeDefaults = useCallback((patch: Partial<UploadDefaults>) => {
    const merged = { ...settings.defaults, ...patch };
    setUploadSettings(setDefault(settings, parseUploadSettings({ defaults: merged }).defaults));
  }, [settings]);
  const applySelection = useCallback(() => {
    const n = applyToSelection(hist, ui.checked, settings.defaults, labelFor("Apply export settings", ui.checked.length));
    scan.say(n > 0 ? `Settings applied to ${n} icon${n === 1 ? "" : "s"}.` : "Select at least one icon first.");
  }, [hist, ui.checked, settings.defaults, scan]);
  const resetRows = useCallback((ids: readonly string[]) => {
    const n = resetSelection(hist, ids);
    scan.say(n > 0 ? `${n} icon${n === 1 ? "" : "s"} now inherit the global defaults.` : "Those icons already inherit the defaults.");
  }, [hist, scan]);
  return { changeDefaults, applySelection, resetRows, toggleAll: (on: boolean) => ui.setChecked(on ? [] : []) };
}

/** The scan + its outcomes: root handle, rows, busy text, toast. */
function useScan() {
  const [root, setRoot] = useState<DirHandleLike | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const token = useRef(0);
  const clear = useCallback(() => setToast(null), []);
  const run = useScanRunner(setRows, setBusy, setToast, token);
  const chooseRoot = useRootPicker(setRoot, run);
  useBootRestore(setRoot, run);
  return {
    root, rows, busy, toast, chooseRoot, dismissToast: clear, say: setToast,
    rescan: () => { if (root !== null) void run(root); },
  };
}

/** Runs one scan; a stale answer from an earlier folder is dropped, not shown. */
function useScanRunner(
  setRows: (rows: UploadRow[]) => void, setBusy: (t: string | null) => void,
  setToast: (t: string | null) => void, token: { current: number },
) {
  return useCallback(async (picked: DirHandleLike) => {
    const id = ++token.current;
    setBusy("Scanning approved SVGs…");
    try {
      const next = await scanRows(picked);
      if (token.current !== id) return;
      setRows(next);
      setToast(next.length === 0 ? "No approved SVGs found in this folder." : null);
    } catch {
      if (token.current === id) setToast("The scan could not read this folder — check the permissions and try again.");
    } finally {
      if (token.current === id) setBusy(null);
    }
  }, [setRows, setBusy, setToast, token]);
}

/** The folder the other tabs already remember is THIS tab's folder too (I-44). */
function useBootRestore(setRoot: (h: DirHandleLike) => void, run: (h: DirHandleLike) => Promise<void>) {
  useEffect(() => {
    void (async () => {
      const stored = (await loadHandles(SVG_HANDLE_KEY))?.source ?? (await loadHandles("__selection__"))?.source ?? null;
      if (stored === null) return;
      setRoot(stored);
      await run(stored);
    })();
  }, [setRoot, run]);
}

/** The one picker every tab uses; a cancelled pick changes nothing. */
function useRootPicker(setRoot: (h: DirHandleLike) => void, run: (h: DirHandleLike) => Promise<void>) {
  return useCallback(async () => {
    const picked = await pickRootWithPath();
    if (picked === null) return;
    setRoot(picked.handle);
    await saveHandles(SVG_HANDLE_KEY, { source: picked.handle }); // both SVG tabs share one root
    await run(picked.handle);
  }, [setRoot, run]);
}

/** The scan itself: discovery -> rows, with the file index as the check. */
async function scanRows(picked: DirHandleLike): Promise<UploadRow[]> {
  const discovery = await discoverApprovedSources(picked);
  return buildUploadRows(discovery.sources.map((s) => ({
    source: s,
    meta: discovery.metas.get(s.id) ?? null,
    exists: (rel) => discovery.fileIndex.has(rel),
    fingerprintOf: (rel) => discovery.fileIndex.get(rel) ?? "",
  })));
}

/** One read per path, remembered; a failed read is remembered as empty. */
function useCodeCache(
  root: DirHandleLike | null, codes: Record<string, string>,
  setCodes: (fn: (c: Record<string, string>) => Record<string, string>) => void,
) {
  const cache = useRef(codes);
  cache.current = codes;
  return useCallback((rel: string) => {
    if (root === null || cache.current[rel] !== undefined) return;
    setCodes((c) => ({ ...c, [rel]: "" }));
    void readSvgText(root, rel).then((text) => setCodes((c) => ({ ...c, [rel]: text ?? "" })));
  }, [root, setCodes]);
}

function toggle(ids: string[], id: string, on: boolean): string[] {
  if (!on) return ids.filter((x) => x !== id);
  return ids.includes(id) ? ids : [...ids, id];
}

function labelFor(what: string, n: number): string {
  return `${what} to ${n} icon${n === 1 ? "" : "s"}`;
}

/** Binds the module store to React (RULE 12): one owner, many readers. */
function useUploadSettings() {
  const [value, setValue] = useState(getUploadSettings);
  useEffect(() => subscribeUploadSettings(() => setValue(getUploadSettings())), []);
  return value;
}

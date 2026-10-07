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
import { readPublishedJpeg } from "./exporter";
import { SVG_HANDLE_KEY } from "../svg/reviewundo";
import { discoverApprovedSources } from "../svg/sources";
import { pickRootWithPath } from "../ui/pickroot";
import { useHistory } from "../state/HistoryProvider";
import { DEFAULT_PREVIEW_BACKGROUND, type PreviewBackground } from "../lib/svgbackground";
import { ZOOM_DEFAULT } from "../lib/zoom";
import { buildUploadRows, type UploadRow } from "../lib/svgupload/rows";
import {
  effectiveSettings, parseUploadSettings, setDefault, setOverride, settingsLineOf, SETTING_FIELDS, type SettingField,
  type UploadDefaults, type UploadSettings,
} from "../lib/svgupload/settings";
import { DEFAULT_UPLOAD_VIEW, uploadCounts, visibleUploadRows, type UploadView } from "../lib/svgupload/view";
import { metaStateOf } from "../lib/svgupload/meta";
import { applyToSelection, resetSelection } from "./settingsactions";
import { useUploadJobs, type DialogState, type JobsApi } from "./useUploadJobs";
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
  /** The published JPEG of one icon as an object URL, or null while/without it. */
  jpegFor: (id: string) => string | null;
  changeDefaults: (patch: Partial<UploadDefaults>) => void;
  applySelection: () => void;
  resetRows: (ids: string[]) => void;
  inheritedFor: (id: string) => boolean;
  /** The row's settings cell, from the same effective values the export reads. */
  settingsTextFor: (id: string) => string;
  settings: UploadSettings;
  /** The effective values for one row, with each field's origin. */
  effectiveOf: (id: string) => ReturnType<typeof effectiveSettings>;
  /** Writes ONE field as an override for one icon (the settings dialog). */
  patchRow: (id: string, field: SettingField, value: unknown) => void;
  /** The naming/export slice: metadata, jobs, dialogs, clipboard. */
  jobs: JobsApi;
  /** The dialog currently open, with the row it belongs to. */
  dialog: DialogState | null;
  dialogRow: UploadRow | null;
}

export function useUpload(): UploadApi {
  const settings = useUploadSettings();
  const scan = useScan();
  const ui = useListState();
  const jobs = useUploadJobs({ root: scan.root, rows: scan.rows, settings, rootName: scan.root?.name ?? "" });
  const rows = useRowsWithJobs(scan.rows, jobs, settings);
  const derived = useDerivedRows(rows, ui.view);
  const loadCode = useCodeCache(scan.root, ui.codes, ui.setCodes);
  const jpegFor = useJpegCache(scan.root, rows);
  const acts = useUploadActions(scan, ui, settings);
  const dialogRow = useMemo(() => jobs.dialog === null ? null : rows.find((r) => r.id === jobs.dialog?.id) ?? null, [jobs.dialog, rows]);
  const patchRow = useCallback((id: string, field: SettingField, value: unknown) => {
    setUploadSettings(setOverride(getUploadSettings(), id, { [field]: value } as Partial<UploadDefaults>));
  }, []);
  return {
    ...scan, ...ui, loadCode, jpegFor, ...acts, rows, jobs, settings, patchRow,
    effectiveOf: useCallback((id: string) => effectiveSettings(getUploadSettings(), id), []),
    dialog: jobs.dialog, dialogRow,
    defaults: settings.defaults, counts: derived.counts, visible: derived.visible,
    // "Inherited" means the icon overrides NOTHING — the chip must react to any
    // field, not just the scale (editing the padding used to leave it saying
    // "inherited settings").
    inheritedFor: useCallback((id: string) => effectiveSettings(settings, id).inherited.length === SETTING_FIELDS.length, [settings]),
    settingsTextFor: useCallback((id: string) => settingsLineOf(effectiveSettings(getUploadSettings(), id).values), []),
  };
}

/**
 * The scan's rows, annotated with what the store knows NOW: the metadata state
 * (accepted / stale / rejected) and the job state. Recomputing them here — and
 * not inside the scan — is what keeps a rescan from forgetting a job that just
 * finished, and keeps the metadata freshness honest after a settings change.
 */
function useRowsWithJobs(rows: UploadRow[], jobs: Pick<JobsApi, "meta" | "jobs">, _settings: UploadSettings): UploadRow[] {
  return useMemo(() => rows.map((row) => ({
    ...row,
    metaState: metaStateOf(jobs.meta[row.id] ?? null, row.fingerprint),
    job: jobs.jobs[row.id] ?? row.job,
  })), [rows, jobs.meta, jobs.jobs]);
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

/**
 * The published JPEG per icon, read from the icon's own export folder and
 * released when the tab unmounts. The FILE is the evidence: if it is there the
 * dialog shows it, if it is not the dialog says "Not exported yet" — a record
 * that failed to parse can never make the dialog claim a picture it does not have.
 */
function useJpegCache(root: DirHandleLike | null, rows: readonly UploadRow[]): (id: string) => string | null {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useJpegsFor(root, rows, setUrls);
  useEffect(() => () => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
  }, []);
  return useCallback((id: string) => urls[id] ?? null, [urls]);
}

/** Loads one object URL per row that has a package; a missing file loads nothing. */
function useJpegsFor(
  root: DirHandleLike | null, rows: readonly UploadRow[],
  setUrls: (fn: (u: Record<string, string>) => Record<string, string>) => void,
): void {
  useEffect(() => {
    if (root === null) return;
    let alive = true;
    for (const row of rows) {
      if (row.blocked !== null) continue;
      void readPublishedJpeg(root, row.dirPath, row.exportBase).then((file) => {
        if (!alive || file === null) return;
        setUrls((u) => ({ ...u, [row.id]: URL.createObjectURL(file) }));
      });
    }
    return () => { alive = false; };
  }, [root, rows, setUrls]);
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

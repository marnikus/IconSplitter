// useBatch.ts — UI orchestration for the batch feature (RULE 2/4/5/7/24).
// Owns: root/dest picking, scan + selection state, preset application, and the
// process run that keeps the per-reference JSON in sync. The adapters it calls
// (fs, picker, process, statewrite, store) are separately tested.

import { useCallback, useEffect, useRef, useState } from "react";
import { linkReferences, collectAiImages, walkTree, type AiImageEntry } from "../lib/scan";
import { readDirTree, ensureDirPath, probePath, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { defaultPreset, type Preset } from "../lib/presets";
import { pickDirectory, fsSupported, ensurePermission } from "./picker";
import { pickFolderFor } from "../ui/pickroot";
import { rememberKnownRoot } from "../ui/knownroots";
import { loadRootPath } from "../lib/rootpath";
import { syncAndCollect, applyOutcomes, type StateKey } from "./statewrite";
import { tally, toOutcomes } from "./outcomes";
import { processItems, type BatchItem, type ItemResult } from "./process";
import { splitSheet } from "../lib/batchsplit";
import { loadImageFile } from "../lib/dom";
import { loadPresets, savePresets, loadLastName, saveLastName, loadHandles, saveHandles } from "./store";
import type { SourceStatus } from "../lib/statefile";

export interface Row extends AiImageEntry {
  status: SourceStatus;
  selected: boolean;
}

export interface BatchState {
  rootName: string;
  destName: string;
  rows: Row[];
  busy: string | null;
  toast: { msg: string; err?: boolean } | null;
  preset: Preset;
  presetNames: string[];
  refWarnings: string[];
}

const OUTPUT_DIR = "_split_output";
const initial: BatchState = {
  rootName: "", destName: "", rows: [], busy: null, toast: null,
  preset: defaultPreset("Default"), presetNames: [], refWarnings: [],
};

type Setter = React.Dispatch<React.SetStateAction<BatchState>>;

/** Mutable context shared by the orchestration functions (grouped, RULE 3). */
interface Ctx {
  root: { current: DirHandleLike | null };
  dest: { current: DirHandleLike | null };
  keys: { current: StateKey[] };
  stop: { current: boolean };
  state: { current: BatchState }; // render-mirror for async callbacks (RULE 24)
}

export function useBatch() {
  const [s, setS] = useState<BatchState>(initial);
  const ctx = useCtx(s);
  useEffect(() => { void boot(ctx, setS); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useToastClear(s.toast, setS);
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  return {
    s, say,
    ...useCoreActions(ctx, setS, say),
    ...useViewActions(ctx, setS),
    ...usePresetActions(ctx, setS, say),
    supported: fsSupported(),
  };
}

function useCtx(s: BatchState): Ctx {
  const stateRef = useRef(s);
  stateRef.current = s; // render-mirror so async callbacks read live state (RULE 24)
  return { root: useRef(null), dest: useRef(null), keys: useRef([]), stop: useRef(false), state: stateRef };
}

function useCoreActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const chooseRoot = useCallback(async () => {
    const picked = await pickFolderFor((h) => { ctx.root.current = h; });
    if (!picked) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    await scan(ctx, setS, say);
    if (picked.message !== null) say(picked.message, !picked.pathCaptured);
  }, [ctx, setS, say]);

  // The destination is not a scan root: no copy action names it, so its path is
  // not captured (only the root's is — I-35).
  const chooseDest = useCallback(async () => {
    const h = await pickDirectory();
    if (!h) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    ctx.dest.current = h;
    setS((p) => ({ ...p, destName: h.name, preset: { ...p.preset, destMode: "custom" } }));
  }, [ctx, setS, say]);

  const refresh = useCallback(() => { void scan(ctx, setS, say); }, [ctx, setS, say]);
  const run = useCallback(() => { void process(ctx, setS); }, [ctx, setS]);
  const cancel = useCallback(() => { ctx.stop.current = true; }, [ctx]);
  return { chooseRoot, chooseDest, refresh, run, cancel };
}

function useViewActions(ctx: Ctx, setS: Setter) {
  const toggle = useCallback((relPath: string) => {
    setS((p) => ({ ...p, rows: p.rows.map((r) => (r.relPath === relPath ? { ...r, selected: !r.selected } : r)) }));
  }, [setS]);

  const selectAll = useCallback((on: boolean) => {
    setS((p) => ({ ...p, rows: p.rows.map((r) => (selectable(r) ? { ...r, selected: on } : r)) }));
  }, [setS]);

  const thumbUrl = useCallback(async (relPath: string) => {
    const root = ctx.root.current;
    if (!root) throw new Error("No folder selected");
    return URL.createObjectURL(await (await resolveFile(root, relPath)).getFile());
  }, [ctx]);

  return { toggle, selectAll, thumbUrl };
}

function usePresetActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const setPreset = useCallback((patch: Partial<Preset>) => {
    setS((p) => ({ ...p, preset: { ...p.preset, ...patch } }));
  }, [setS]);

  const savePreset = useCallback(async (name: string) => {
    const named = { ...ctx.state.current.preset, name };
    savePresets([...loadPresets().filter((p) => p.name !== name), named]);
    saveLastName(name);
    await saveHandles(name, { source: ctx.root.current ?? undefined, dest: ctx.dest.current ?? undefined });
    setS((p) => ({ ...p, preset: named, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset “${name}” saved` } }));
  }, [ctx, setS]);

  const loadPreset = useCallback(async (name: string) => {
    const found = loadPresets().find((p) => p.name === name);
    if (!found) return say(`Preset “${name}” not found`, true);
    saveLastName(name);
    await applyHandles(ctx, setS, found);
  }, [ctx, setS, say]);

  const deletePreset = useCallback((name: string) => {
    savePresets(loadPresets().filter((p) => p.name !== name));
    setS((p) => ({ ...p, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset “${name}” deleted` } }));
  }, [setS]);

  return { setPreset, savePreset, loadPreset, deletePreset };
}

function selectable(r: Row): boolean {
  return r.status !== "missing" && r.status !== "deleted";
}

function useToastClear(toast: BatchState["toast"], setS: Setter): void {
  useEffect(() => {
    const t = toast ? setTimeout(() => setS((p) => ({ ...p, toast: null })), 4000) : 0;
    return () => clearTimeout(t);
  }, [toast, setS]);
}

/** Restores the last-used preset + its saved folders on first open (spec §3). */
async function boot(ctx: Ctx, setS: Setter): Promise<void> {
  const presets = loadPresets();
  const preset = presets.find((p) => p.name === loadLastName()) ?? defaultPreset("Default");
  setS((p) => ({ ...p, presetNames: presets.map((x) => x.name) }));
  await applyHandles(ctx, setS, preset);
}

async function applyHandles(ctx: Ctx, setS: Setter, preset: Preset): Promise<void> {
  const stored = await loadHandles(preset.name);
  ctx.root.current = await grant(stored?.source);
  ctx.dest.current = await grant(stored?.dest);
  setS((p) => ({ ...p, preset, destName: ctx.dest.current?.name ?? "" }));
  if (ctx.root.current) {
    rememberKnownRoot(ctx.root.current, loadRootPath(ctx.root.current.name));
    await scan(ctx, setS, () => {});
  }
}

async function grant(h: DirHandleLike | undefined): Promise<DirHandleLike | null> {
  return h && (await ensurePermission(h)) ? h : null;
}

async function scan(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  setS((p) => ({ ...p, busy: "Scanning…", rootName: root.name }));
  try {
    const images = await scanImages(root, ctx.state.current.preset);
    const res = await syncAndCollect({
      root, images, prevKeys: ctx.keys.current, overrides: new Map(), now: new Date().toISOString(),
    });
    ctx.keys.current = res.keys;
    finishScan(images, res.statuses, setS, say);
  } catch (e) {
    setS((p) => ({ ...p, busy: null }));
    say((e as Error).message || "Scan failed", true);
  }
}

async function scanImages(root: DirHandleLike, preset: Preset): Promise<AiImageEntry[]> {
  const tree = await readDirTree(root, preset.ignoreFolders);
  const entries = walkTree(tree, preset.ignoreFolders);
  return linkReferences(collectAiImages(entries), entries);
}

function finishScan(
  images: AiImageEntry[], statuses: Map<string, SourceStatus>, setS: Setter, say: (m: string, e?: boolean) => void,
): void {
  setS((p) => ({
    ...p, busy: null,
    rows: images.map((img) => toRow(img, statuses)),
    refWarnings: images.filter((i) => i.refRelPath === null).map((i) => i.relPath),
  }));
  say(`Found ${images.length} AI image${images.length === 1 ? "" : "s"}`);
}

function toRow(img: AiImageEntry, statuses: Map<string, SourceStatus>): Row {
  const status = statuses.get(img.relPath.toLowerCase()) ?? "unprocessed";
  return { ...img, status, selected: status !== "missing" && status !== "deleted" };
}

async function process(ctx: Ctx, setS: Setter): Promise<void> {
  const root = ctx.root.current;
  if (!root) return;
  ctx.stop.current = false;
  const selected = ctx.state.current.rows.filter((r) => r.selected);
  if (!selected.length) return setS((p) => ({ ...p, toast: { msg: "Nothing selected", err: true } }));
  setS((p) => ({ ...p, busy: "Preparing…" }));
  const report = await runBatch(ctx, root, selected, setS);
  await finalize(root, report.results, selected, setS);
}

async function runBatch(ctx: Ctx, root: DirHandleLike, selected: Row[], setS: Setter) {
  const items = await buildItems(root, selected);
  const dest = ctx.dest.current ?? await ensureDirPath(root, OUTPUT_DIR);
  return processItems(items, {
    dest, split: ctx.state.current.preset.split, splitImage: splitOne, now: new Date(),
    shouldStop: () => ctx.stop.current,
    onProgress: (d, t) => setS((p) => ({ ...p, busy: `Splitting ${d}/${t}…` })),
  });
}

async function splitOne(file: File, split: Parameters<typeof splitSheet>[1]): Promise<Blob[]> {
  return splitSheet(await loadImageFile(file), split);
}

async function buildItems(root: DirHandleLike, rows: Row[]): Promise<BatchItem[]> {
  const out: BatchItem[] = [];
  for (const r of rows) out.push(await toItem(root, r));
  return out;
}

async function toItem(root: DirHandleLike, r: Row): Promise<BatchItem> {
  return {
    source: { relPath: r.relPath, name: r.name, relDir: r.dirPath, refRelPath: r.refRelPath },
    file: await resolveFile(root, r.relPath),
    refFile: r.refRelPath ? await tryResolve(root, r.refRelPath) : null,
  };
}

async function resolveFile(root: DirHandleLike, relPath: string): Promise<FileHandleLike> {
  const idx = relPath.lastIndexOf("/");
  const dir = idx < 0 ? root : (await probePath(root, relPath.slice(0, idx)))!;
  return dir.getFileHandle(relPath.slice(idx + 1), { create: false });
}

async function tryResolve(root: DirHandleLike, relPath: string): Promise<FileHandleLike | null> {
  try {
    return await resolveFile(root, relPath);
  } catch {
    return null;
  }
}

/** Persists outcomes into the state JSON and mirrors them into the UI (RULE 24). */
async function finalize(root: DirHandleLike, results: ItemResult[], selected: Row[], setS: Setter): Promise<void> {
  const dirs = new Map(selected.map((r) => [r.relPath.toLowerCase(), r.dirPath]));
  const outcomes = toOutcomes(results, dirs);
  await applyOutcomes(root, outcomes, new Date().toISOString());
  const byPath = new Map(outcomes.map((o) => [o.relPath.toLowerCase(), o.status]));
  const c = tally(results);
  setS((p) => ({
    ...p, busy: null,
    rows: p.rows.map((r) => ({ ...r, status: byPath.get(r.relPath.toLowerCase()) ?? r.status, selected: false })),
    toast: { msg: `Processed ${c.done}, skipped ${c.skipped}, failed ${c.failed}`, err: c.failed > 0 },
  }));
}

// useBatch.ts — UI orchestration for batch (RULE 2/4/5/7/24)
// Owns root/dest picking, scan + selection, preset, rowMerges, process run

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultPreset, type Preset } from "../lib/presets";
import { pickDirectory, fsSupported, ensurePermission, peekPermission } from "./picker";
import { pickFolderFor } from "../ui/pickroot";
import { restoreKnownRoot } from "../lib/knownroots";
import { loadPresets, savePresets, loadLastName, saveLastName, loadHandles, saveHandles } from "./store";
import { loadRowMerges, saveRowMerges, deleteRowMerges } from "../lib/batchmerges";
import type { DirHandleLike } from "../lib/fs";
import type { StateKey } from "./statewrite";
import type { BatchState, Ctx, Row, Setter } from "./useBatchTypes";
import { scan as scanOp, batchProcess, decideReview } from "./batchOps";
import type { BatchReviewStatus } from "../lib/statefile";

const initial: BatchState = {
  rootName: "", destName: "", rows: [], busy: null, toast: null,
  preset: defaultPreset("Default"), presetNames: [], refWarnings: [],
  rowMerges: {}, progress: null, running: false, needsGrant: false,
};

export type { Row, RowMergeMap, BatchState } from "./useBatchTypes";

export function useBatch() {
  const [s, setS] = useState<BatchState>(initial);
  const ctx = useCtx(s);
  const mergesLive = useRef(false);
  // ONE write path for per-item decisions (I-67): every rowMerges change lands
  // in the per-preset store. The first run is the mount-time empty map and must
  // not clobber what boot is about to load.
  useEffect(() => {
    if (!mergesLive.current) { mergesLive.current = true; return; }
    saveRowMerges(s.preset.name, s.rowMerges);
  }, [s.rowMerges, s.preset.name]);
  useToastClear(s.toast, setS);
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  useEffect(() => { void boot(ctx, setS, say); }, [ctx, say]); // ctx and say are stable, so this still runs once
  // A fresh literal here made `core` (and everything derived from it) new on
  // every render — the scroll CPU spike. Memoize every bag.
  const coreActions = useCoreActions(ctx, setS, say);
  const viewActions = useViewActions(ctx, setS);
  const presetActions = usePresetActions(ctx, setS, say);
  const supported = useMemo(() => fsSupported(), []);
  return useMemo(() => ({ s, say, ...coreActions, ...viewActions, ...presetActions, supported, rootRef: ctx.root }),
    [s, say, coreActions, viewActions, presetActions, supported, ctx.root]);
}

function useCtx(s: BatchState): Ctx {
  // Refs at the TOP level — hooks called inside a useMemo factory would vanish
  // from the hook list after the first render and break reconciliation.
  const stateRef = useRef(s);
  const root = useRef<DirHandleLike | null>(null);
  const dest = useRef<DirHandleLike | null>(null);
  const keys = useRef<StateKey[]>([]);
  const stop = useRef(false);
  stateRef.current = s;
  return useMemo<Ctx>(() => ({ root, dest, keys, stop, state: stateRef }), [root, dest, keys, stop, stateRef]);
}

function makeChooseRoot(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  return async () => {
    const picked = await pickFolderFor((h) => { ctx.root.current = h; });
    if (!picked) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    setS((p) => ({ ...p, needsGrant: false })); // a fresh pick carries its own grant
    await saveHandles(ctx.state.current.preset.name, { source: picked.handle, dest: ctx.dest.current ?? undefined });
    await scanOp(ctx, setS, say);
    if (picked.message !== null) say(picked.message);
  };
}

function makeChooseDest(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  return async () => {
    const h = await pickDirectory();
    if (!h) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    ctx.dest.current = h;
    setS((p) => ({ ...p, destName: h.name, preset: { ...p.preset, destMode: "custom" } }));
    await saveHandles(ctx.state.current.preset.name, { source: ctx.root.current ?? undefined, dest: h });
  };
}

function useCoreActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const chooseRoot = useCallback(makeChooseRoot(ctx, setS, say), [ctx, setS, say]);
  const chooseDest = useCallback(makeChooseDest(ctx, setS, say), [ctx, setS, say]);
  const refresh = useCallback(() => { void scanOp(ctx, setS, say); }, [ctx, setS, say]);
  const run = useCallback(() => { void batchProcess(ctx, setS); }, [ctx, setS]);
  // The one gesture a restart may ask for: re-grant the remembered root, then scan.
  const grantAccess = useCallback(async () => {
    const h = ctx.root.current;
    if (!h) return;
    if (!(await ensurePermission(h))) return say(`Access to "${h.name}" was refused — rows stay hidden until the browser grants it`, true);
    setS((p) => ({ ...p, needsGrant: false }));
    await scanOp(ctx, setS, say);
  }, [ctx, setS, say]);
  const cancel = useCallback(() => { ctx.stop.current = true; }, [ctx]);
  const decide = useCallback((relPaths: string[], review: BatchReviewStatus) => { void decideReview({ ctx, relPaths, review, setS }); }, [ctx, setS]);
  return useMemo(() => ({ chooseRoot, chooseDest, refresh, run, grantAccess, cancel, decide }), [chooseRoot, chooseDest, refresh, run, grantAccess, cancel, decide]);
}

function useViewActions(ctx: Ctx, setS: Setter) {
  const toggle = useCallback((relPath: string) => { setS((p) => ({ ...p, rows: p.rows.map((r) => (r.relPath === relPath ? { ...r, selected: !r.selected } : r)) })); }, [setS]);
  const selectAll = useCallback((on: boolean) => { setS((p) => ({ ...p, rows: p.rows.map((r) => (selectable(r) ? { ...r, selected: on } : r)) })); }, [setS]);
  const setSelected = useCallback((relPaths: string[], on: boolean) => {
    const set = new Set(relPaths.map((x) => x.toLowerCase()));
    setS((p) => ({ ...p, rows: p.rows.map((r) => (set.has(r.relPath.toLowerCase()) ? { ...r, selected: on } : r)) }));
  }, [setS]);
  const thumbUrl = useCallback(async (relPath: string) => {
    if (!ctx.root.current) throw new Error("No folder selected");
    return URL.createObjectURL(await (await resolveFile(ctx.root.current, relPath)).getFile());
  }, [ctx]);
  const setRowMerge = useCallback((relPath: string, value: number | null) => { setS((p) => ({ ...p, rowMerges: { ...p.rowMerges, [relPath.toLowerCase()]: value } })); }, [setS]);
  const clearRowMerge = useCallback((relPath: string) => {
    const k = relPath.toLowerCase();
    setS((p) => { const n = { ...p.rowMerges }; delete n[k]; return { ...p, rowMerges: n }; });
  }, [setS]);
  const clearAllRowMerges = useCallback(() => { setS((p) => ({ ...p, rowMerges: {} })); }, [setS]);
  const setProgress = useCallback((progress: BatchState["progress"]) => { setS((p) => ({ ...p, progress })); }, [setS]);
  return useMemo(() => ({ toggle, selectAll, setSelected, thumbUrl, setRowMerge, clearRowMerge, clearAllRowMerges, setProgress }), [toggle, selectAll, setSelected, thumbUrl, setRowMerge, clearRowMerge, clearAllRowMerges, setProgress]);
}

function usePresetActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const setPreset = useSetPreset(setS);
  const savePreset = useSavePreset(ctx, setS);
  const loadPreset = useLoadPreset(ctx, setS, say);
  const deletePreset = useDeletePreset(setS);
  return useMemo(() => ({ setPreset, savePreset, loadPreset, deletePreset }), [setPreset, savePreset, loadPreset, deletePreset]);
}

function useSetPreset(setS: Setter) {
  return useCallback((patch: Partial<Preset>) => {
    setS((p) => {
      const next = { ...p.preset, ...patch };
      savePresets([...loadPresets().filter((x) => x.name !== next.name), next]);
      saveLastName(next.name);
      return { ...p, preset: next };
    });
  }, [setS]);
}

function useSavePreset(ctx: Ctx, setS: Setter) {
  return useCallback(async (name: string) => {
    const named = { ...ctx.state.current.preset, name };
    savePresets([...loadPresets().filter((p) => p.name !== name), named]);
    saveLastName(name);
    saveRowMerges(name, ctx.state.current.rowMerges); // Save-as duplicates the decisions
    await saveHandles(name, { source: ctx.root.current ?? undefined, dest: ctx.dest.current ?? undefined });
    setS((p) => ({ ...p, preset: named, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset "${name}" saved` } }));
  }, [ctx, setS]);
}

function useLoadPreset(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  return useCallback(async (name: string) => {
    const found = loadPresets().find((p) => p.name === name);
    if (!found) return say(`Preset "${name}" not found`, true);
    saveLastName(name);
    await applyHandles(ctx, setS, found, say);
  }, [ctx, setS, say]);
}

function useDeletePreset(setS: Setter) {
  return useCallback((name: string) => {
    savePresets(loadPresets().filter((p) => p.name !== name));
    deleteRowMerges(name);
    setS((p) => ({ ...p, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset "${name}" deleted` } }));
  }, [setS]);
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

async function boot(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void): Promise<void> {
  const presets = loadPresets();
  const preset = presets.find((p) => p.name === loadLastName()) ?? defaultPreset("Default");
  setS((p) => ({ ...p, presetNames: presets.map((x) => x.name) }));
  await applyHandles(ctx, setS, preset, say);
}

/** Quiet boot decision: keep both handles, ask the browser nothing (I-66). */
async function quietHandles(stored: { source?: DirHandleLike; dest?: DirHandleLike } | null): Promise<{ source: DirHandleLike | null; dest: DirHandleLike | null; sourceOk: boolean; destOk: boolean }> {
  const source = stored?.source ?? null;
  const dest = stored?.dest ?? null;
  return {
    source, dest,
    sourceOk: source ? (await peekPermission(source)) === "granted" : false,
    destOk: dest ? (await peekPermission(dest)) === "granted" : false,
  };
}

async function applyHandles(ctx: Ctx, setS: Setter, preset: Preset, say: (m: string, e?: boolean) => void): Promise<void> {
  const h = await quietHandles(await loadHandles(preset.name));
  ctx.root.current = h.source;
  ctx.dest.current = h.dest;
  const merges = loadRowMerges(preset.name); // the preset's saved decisions ride along (I-67)
  setS((p) => ({ ...p, preset, destName: h.destOk ? h.dest?.name ?? "" : "", rowMerges: merges, needsGrant: Boolean(h.source) && !h.sourceOk }));
  if (h.source && h.sourceOk) {
    await restoreKnownRoot(h.source);
    await scanOp(ctx, setS, say); // a failed boot scan is spoken, never silent (RULE 4)
  }
}

async function resolveFile(root: DirHandleLike, relPath: string) {
  const idx = relPath.lastIndexOf("/");
  const dirPath = idx < 0 ? "" : relPath.slice(0, idx);
  const fileName = idx < 0 ? relPath : relPath.slice(idx + 1);
  let cur: DirHandleLike = root;
  if (dirPath) {
    for (const part of dirPath.split("/")) cur = await cur.getDirectoryHandle(part, { create: false });
  }
  return cur.getFileHandle(fileName, { create: false });
}

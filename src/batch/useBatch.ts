// useBatch.ts — UI orchestration for batch (RULE 2/4/5/7/24)
// Owns root/dest picking, scan + selection, preset, rowMerges, process run

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultPreset, type Preset } from "../lib/presets";
import { pickDirectory, fsSupported, ensurePermission } from "./picker";
import { pickFolderFor } from "../ui/pickroot";
import { restoreKnownRoot } from "../lib/knownroots";
import { loadPresets, savePresets, loadLastName, saveLastName, loadHandles, saveHandles } from "./store";
import type { DirHandleLike } from "../lib/fs";
import type { BatchState, Ctx, Row, Setter } from "./useBatchTypes";
import { scan as scanOp, batchProcess } from "./batchOps";

const initial: BatchState = {
  rootName: "",
  destName: "",
  rows: [],
  busy: null,
  toast: null,
  preset: defaultPreset("Default"),
  presetNames: [],
  refWarnings: [],
  rowMerges: {},
  progress: null,
  running: false,
};

export type { Row, RowMergeMap, BatchState } from "./useBatchTypes";

export function useBatch() {
  const [s, setS] = useState<BatchState>(initial);
  const ctx = useCtx(s);
  useEffect(() => {
    void boot(ctx, setS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useToastClear(s.toast, setS);
  const say = useCallback((msg: string, err = false) => setS((p) => ({ ...p, toast: { msg, err } })), []);
  return {
    s,
    say,
    ...useCoreActions(ctx, setS, say),
    ...useViewActions(ctx, setS),
    ...usePresetActions(ctx, setS, say),
    supported: fsSupported(),
    rootRef: ctx.root,
  };
}

function useCtx(s: BatchState): Ctx {
  const stateRef = useRef(s);
  stateRef.current = s;
  return { root: useRef(null), dest: useRef(null), keys: useRef([]), stop: useRef(false), state: stateRef };
}

function useCoreActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const chooseRoot = useCallback(async () => {
    const picked = await pickFolderFor((h) => {
      ctx.root.current = h;
    });
    if (!picked) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    const presetName = ctx.state.current.preset.name;
    await saveHandles(presetName, { source: picked.handle, dest: ctx.dest.current ?? undefined });
    await scanOp(ctx, setS, say);
    if (picked.message !== null) say(picked.message);
  }, [ctx, setS, say]);
  const chooseDest = useCallback(async () => {
    const h = await pickDirectory();
    if (!h) return say("Folder picking needs Chrome or Edge — or was cancelled", true);
    ctx.dest.current = h;
    setS((p) => ({ ...p, destName: h.name, preset: { ...p.preset, destMode: "custom" } }));
    const presetName = ctx.state.current.preset.name;
    await saveHandles(presetName, { source: ctx.root.current ?? undefined, dest: h });
  }, [ctx, setS, say]);
  const refresh = useCallback(() => {
    void scanOp(ctx, setS, say);
  }, [ctx, setS, say]);
  const run = useCallback(() => {
    void batchProcess(ctx, setS);
  }, [ctx, setS]);
  const cancel = useCallback(() => {
    ctx.stop.current = true;
  }, [ctx]);
  return { chooseRoot, chooseDest, refresh, run, cancel };
}

function useViewActions(ctx: Ctx, setS: Setter) {
  const toggle = useCallback((relPath: string) => {
    setS((p) => ({ ...p, rows: p.rows.map((r) => (r.relPath === relPath ? { ...r, selected: !r.selected } : r)) }));
  }, [setS]);
  const selectAll = useCallback((on: boolean) => {
    setS((p) => ({ ...p, rows: p.rows.map((r) => (selectable(r) ? { ...r, selected: on } : r)) }));
  }, [setS]);
  const setSelected = useCallback((relPaths: string[], on: boolean) => {
    const set = new Set(relPaths.map((x) => x.toLowerCase()));
    setS((p) => ({ ...p, rows: p.rows.map((r) => (set.has(r.relPath.toLowerCase()) ? { ...r, selected: on } : r)) }));
  }, [setS]);
  const thumbUrl = useCallback(async (relPath: string) => {
    if (!ctx.root.current) throw new Error("No folder selected");
    return URL.createObjectURL(await (await resolveFile(ctx.root.current, relPath)).getFile());
  }, [ctx]);
  const setRowMerge = useCallback((relPath: string, value: number | null) => {
    setS((p) => ({ ...p, rowMerges: { ...p.rowMerges, [relPath.toLowerCase()]: value } }));
  }, [setS]);
  const clearRowMerge = useCallback((relPath: string) => {
    const k = relPath.toLowerCase();
    setS((p) => { const n = { ...p.rowMerges }; delete n[k]; return { ...p, rowMerges: n }; });
  }, [setS]);
  const clearAllRowMerges = useCallback(() => { setS((p) => ({ ...p, rowMerges: {} })); }, [setS]);
  const setProgress = useCallback((progress: BatchState["progress"]) => {
    setS((p) => ({ ...p, progress }));
  }, [setS]);
  return { toggle, selectAll, setSelected, thumbUrl, setRowMerge, clearRowMerge, clearAllRowMerges, setProgress };
}

function usePresetActions(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  const setPreset = useSetPreset(setS);
  const savePreset = useSavePreset(ctx, setS);
  const loadPreset = useLoadPreset(ctx, setS, say);
  const deletePreset = useDeletePreset(setS);
  return { setPreset, savePreset, loadPreset, deletePreset };
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
    await saveHandles(name, { source: ctx.root.current ?? undefined, dest: ctx.dest.current ?? undefined });
    setS((p) => ({ ...p, preset: named, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset \"${name}\" saved` } }));
  }, [ctx, setS]);
}

function useLoadPreset(ctx: Ctx, setS: Setter, say: (m: string, e?: boolean) => void) {
  return useCallback(async (name: string) => {
    const found = loadPresets().find((p) => p.name === name);
    if (!found) return say(`Preset \"${name}\" not found`, true);
    saveLastName(name);
    await applyHandles(ctx, setS, found);
  }, [ctx, setS, say]);
}

function useDeletePreset(setS: Setter) {
  return useCallback((name: string) => {
    savePresets(loadPresets().filter((p) => p.name !== name));
    setS((p) => ({ ...p, presetNames: loadPresets().map((x) => x.name), toast: { msg: `Preset \"${name}\" deleted` } }));
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
    await restoreKnownRoot(ctx.root.current);
    await scanOp(ctx, setS, () => {});
  }
}

async function grant(h: DirHandleLike | undefined): Promise<DirHandleLike | null> {
  return h && (await ensurePermission(h)) ? h : null;
}

async function resolveFile(root: DirHandleLike, relPath: string) {
  const idx = relPath.lastIndexOf("/");
  const dirPath = idx < 0 ? "" : relPath.slice(0, idx);
  const fileName = idx < 0 ? relPath : relPath.slice(idx + 1);
  let cur: DirHandleLike = root;
  if (dirPath) {
    for (const part of dirPath.split("/")) {
      cur = await cur.getDirectoryHandle(part, { create: false });
    }
  }
  return cur.getFileHandle(fileName, { create: false });
}

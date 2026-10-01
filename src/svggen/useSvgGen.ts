// useSvgGen.ts — Generate SVG tab orchestration: approved sources + sidecars
// into rows, selection, filters, and the generate/review actions. The request
// runs in runner.ts, writes in applyplan.ts; this hook only glues (RULE 18).

import { useEffect, useMemo, useState } from "react";
import type { RequestyConfig } from "../lib/requesty";
import { makeBatches, type BatchSource, type SvgBatch } from "../lib/svgmanifest";
import { latestValid, type Sidecar } from "../lib/svgsidecar";
import type { ViewPair } from "../lib/reviewfilter";
import { useSelection } from "../selection/useSelection";
import { applyPlan } from "./applyplan";
import { loadConfig } from "./configstore";
import { buildComposite } from "./composite";
import { planOutcomes, type PlanSource } from "./generateflow";
import { getKey, maskedKey, setKey } from "./keystore";
import { loadPrompt, resetPrompt, savePrompt } from "./promptstore";
import type { DirHandleLike } from "../lib/fs";
import {
  aiName, approvedSources, filterRows, fingerprintOf, rowFrom, sortRows,
  DEFAULT_ROW_FILTERS, type GenState, type RowFilters, type RowSort, type SvgRow,
} from "./rows";
import { runBatch, type FetchLike } from "./runner";
import { saveSidecar } from "./sidecarstore";
import { blobToDataUrl, browserComposite, browserFetch, dirFor, loadAllSidecars, readLatestSvg } from "./browserdeps";

export interface SvgGenApi {
  supported: boolean;
  rootName: string;
  chooseRoot: () => void;
  rescan: () => void;
  toast: string | null;
  rows: SvgRow[];
  visible: SvgRow[];
  checked: string[];
  toggle: (id: string) => void;
  checkVisible: () => void;
  deselectAll: () => void;
  filters: RowFilters;
  setFilters: (f: RowFilters) => void;
  sortBy: RowSort;
  setSortBy: (s: RowSort) => void;
  sidecarErrors: Set<string>;
  generate: (ids: string[]) => Promise<void>;
  review: (ids: string[], r: "approved" | "declined") => Promise<void>;
  prompt: string;
  editPrompt: (t: string) => void;
  resetPrompt: () => void;
  keyMasked: string;
  saveKey: (k: string) => void;
  svgText: (id: string) => Promise<string | null>;
  versionsOf: (id: string) => Sidecar["versions"];
}

export function useSvgGen(fetchLike: FetchLike = browserFetch): SvgGenApi {
  const core = useSelection();
  const approved = useMemo(() => approvedSources(core.s.pairs), [core.s.pairs]);
  const [sidecars, setSidecars] = useState<Map<string, Sidecar | null>>(new Map());
  const [checked, setChecked] = useState<string[]>([]);
  const [filters, setFilters] = useState<RowFilters>(DEFAULT_ROW_FILTERS);
  const [sortBy, setSortBy] = useState<RowSort>("newest");
  const [live, setLive] = useState<Map<string, GenState>>(new Map());
  const [sidecarErrors, setSidecarErrors] = useState<Set<string>>(new Set());
  const { prompt, editPrompt, resetPrompt } = usePromptState();
  const { keyMasked, saveKey } = useKeyState();

  useEffect(() => {
    void loadAllSidecars(core.rootRef.current, approved).then(setSidecars);
  }, [approved, core.rootRef]);
  const { rows, visible } = useDerived({ approved, sidecars, live, sidecarErrors, filters, sortBy });

  const genCtx = { core, approved, sidecars, fetchLike, prompt, setSidecars, setLive, setSidecarErrors, say: core.say };
  return {
    supported: core.supported, rootName: core.s.rootName, chooseRoot: core.chooseRoot, rescan: core.rescan,
    toast: core.s.toast?.msg ?? null, rows, visible, checked,
    ...selectionApi(setChecked, visible),
    filters, setFilters, sortBy, setSortBy, sidecarErrors,
    generate: (ids) => generate(ids, genCtx),
    review: (ids, r) => review(ids, r, { core, approved, sidecars, setSidecars, say: core.say }),
    prompt, editPrompt, resetPrompt, keyMasked, saveKey,
    svgText: (id) => readLatestSvg(core.rootRef.current, approved.find((p) => p.pairId === id) ?? null, sidecars.get(id) ?? null),
    versionsOf: (id) => (sidecars.get(id) ?? null)?.versions ?? [],
  };
}

interface DerivedArgs { approved: ViewPair[]; sidecars: Map<string, Sidecar | null>; live: Map<string, GenState>; sidecarErrors: Set<string>; filters: RowFilters; sortBy: RowSort }

function useDerived(a: DerivedArgs) { const { approved: ap, sidecars: sc, live, sidecarErrors: err, filters: f, sortBy } = a;
  const rows = useMemo(() => ap.map((p) => rowFrom(p, sc.get(p.pairId) ?? null, live.get(p.pairId) ?? null, err.has(p.pairId))), [ap, sc, live, err]);
  const visible = useMemo(() => sortRows(filterRows(rows, f), sortBy), [rows, f, sortBy]);
  return { rows, visible };
}

function usePromptState() {
  const [prompt, setPrompt] = useState(loadPrompt);
  return {
    prompt,
    editPrompt: (t: string) => { setPrompt(t); savePrompt(t); },
    resetPrompt: () => { resetPrompt(); setPrompt(loadPrompt()); },
  };
}

function useKeyState() {
  const [keyMasked, setKeyMasked] = useState(maskedKey);
  return {
    keyMasked,
    saveKey: (k: string) => { setKey(k); setKeyMasked(maskedKey()); },
  };
}

function selectionApi(setChecked: React.Dispatch<React.SetStateAction<string[]>>, visible: SvgRow[]) {
  return {
    toggle: (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])),
    checkVisible: () => setChecked((c) => [...new Set([...c, ...visible.map((v) => v.pairId)])]),
    deselectAll: () => setChecked([]),
  };
}

interface GenCtx {
  core: ReturnType<typeof useSelection>;
  approved: ViewPair[];
  sidecars: Map<string, Sidecar | null>;
  fetchLike: FetchLike;
  prompt: string;
  setSidecars: (m: Map<string, Sidecar | null>) => void;
  setLive: (m: Map<string, GenState>) => void;
  setSidecarErrors: (fn: (s: Set<string>) => Set<string>) => void;
  say: (m: string, e?: boolean) => void;
}

async function generate(ids: string[], ctx: GenCtx): Promise<void> {
  const cfg = loadConfig();
  if (!getKey()) return ctx.say("Set your Requesty API key first — it stays on this machine", true);
  const chosen = ctx.approved.filter((p) => ids.includes(p.pairId));
  if (chosen.length === 0) return;
  ctx.setLive(new Map(chosen.map((p) => [p.pairId, "generating" as GenState])));
  try {
    const summary = await runBatches(makeBatches(toSources(chosen), cfg.perRequest), cfg, ctx);
    ctx.say(summary.failed === 0 ? `${summary.saved} svg${summary.saved === 1 ? "" : "s"} generated` : `${summary.saved} generated · ${summary.failed} failed or missing`);
  } finally {
    ctx.setLive(new Map());
  }
}

async function runBatches(batches: SvgBatch[], cfg: RequestyConfig, ctx: GenCtx): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const b of batches) {
    const r = await runOneBatch(b, cfg, ctx);
    saved += r.summary?.saved ?? 0;
    failed += b.items.length - (r.summary?.saved ?? 0);
  }
  return { saved, failed };
}

async function runOneBatch(b: SvgBatch, cfg: RequestyConfig, ctx: GenCtx) {
  const root = ctx.core.rootRef.current;
  if (!root) throw new Error("no root folder");
  const files = await batchFiles(b, new Map(ctx.approved.map((p) => [p.pairId, p])), root);
  const comp = files.length > 1 ? await buildComposite(files, b.grid, browserComposite(), { canvasSize: 1024, padding: 16 }) : null;
  const dataUrl = comp ? await blobToDataUrl(comp.blob) : await blobToDataUrl(files[0]);
  const result = await runBatch({ batch: b, cfg, key: getKey() ?? "", prompt: ctx.prompt, imageUrl: dataUrl, fetchLike: ctx.fetchLike });
  if (result.failure) {
    ctx.say(`Batch failed: ${result.failure.safeMessage}`, true);
    return result;
  }
  await applyResults({ b, result, hash: comp?.hash ?? null, ctx, root });
  return result;
}

interface ApplyArgs { b: SvgBatch; result: Awaited<ReturnType<typeof runBatch>>; hash: string | null; ctx: GenCtx; root: DirHandleLike }

async function applyResults(a: ApplyArgs): Promise<void> {
  const { b, result, hash, ctx, root } = a;
  const sources = toSources(ctx.approved.filter((p) => b.items.some((i) => i.id === p.pairId)));
  const plans = planOutcomes({
    sources, outcomes: result.outcomes, usage: result.usage,
    meta: {
      batchId: b.batchId, requestId: result.requestId, prompt: ctx.prompt,
      provider: "requesty", model: loadConfig().model, compositeHash: hash, nowIso: new Date().toISOString(),
    },
    prev: ctx.sidecars,
  });
  const applied = await applyPlan((rel) => dirFor(root, rel), plans.values());
  const next = new Map(ctx.sidecars);
  for (const [id, plan] of plans) next.set(id, plan.sidecar);
  ctx.setSidecars(next);
  if (applied.sidecarErrors.length) ctx.setSidecarErrors((s) => new Set([...s, ...applied.sidecarErrors]));
}

async function batchFiles(b: SvgBatch, pairOf: Map<string, ViewPair>, root: DirHandleLike): Promise<File[]> {
  const files: File[] = [];
  for (const item of b.items) {
    const p = pairOf.get(item.id);
    if (!p?.ai) throw new Error(`source gone: ${item.id}`);
    files.push(await (await (await dirFor(root, p.relDir)).getFileHandle(aiName(p))).getFile());
  }
  return files;
}

function toSources(pairs: ViewPair[]): (PlanSource & BatchSource)[] {
  return pairs.map((p) => ({
    pairId: p.pairId, relDir: p.relDir, aiName: aiName(p), fingerprint: fingerprintOf(p),
    id: p.pairId, name: aiName(p), relPath: p.relDir,
  }));
}

interface ReviewCtx {
  core: ReturnType<typeof useSelection>;
  approved: ViewPair[];
  sidecars: Map<string, Sidecar | null>;
  setSidecars: (m: Map<string, Sidecar | null>) => void;
  say: (m: string, e?: boolean) => void;
}

async function review(ids: string[], r: "approved" | "declined", ctx: ReviewCtx): Promise<void> {
  const root = ctx.core.rootRef.current;
  if (!root) return;
  const next = withReviews(ids, r, ctx.sidecars);
  if (next === null) return ctx.say("Nothing with a generated svg in that selection");
  await persistReviews(ids, next, ctx, root);
  ctx.setSidecars(next);
  ctx.say(`Marked ${r}`);
}

function withReviews(ids: string[], r: "approved" | "declined", sidecars: Map<string, Sidecar | null>): Map<string, Sidecar | null> | null {
  const next = new Map(sidecars);
  let changed = 0;
  for (const id of ids) {
    const sc = sidecars.get(id) ?? null;
    const valid = sc ? latestValid(sc) : null;
    if (!sc || !valid) continue;
    next.set(id, { ...sc, versions: sc.versions.map((v) => (v.version === valid.version ? { ...v, review: r } : v)) });
    changed++;
  }
  return changed === 0 ? null : next;
}

async function persistReviews(ids: string[], next: Map<string, Sidecar | null>, ctx: ReviewCtx, root: DirHandleLike): Promise<void> {
  for (const id of ids) {
    const p = ctx.approved.find((x) => x.pairId === id);
    const sc = next.get(id);
    if (!p?.ai || !sc) continue;
    try {
      await saveSidecar(await dirFor(root, p.relDir), aiName(p), sc);
    } catch {
      ctx.say("Sidecar save failed — review kept in memory", true);
    }
  }
}


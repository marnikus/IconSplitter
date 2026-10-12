// previewsession.ts — one "Preview splits" session (design D3/D6/D9, I-67/I-68).
// Owns: the row set, the settings fingerprint, the generation counter, the queue,
// the strip cache and the per-row states. It reads pixels through the injected work
// function and writes nothing — no file, no state JSON, no status, no undo entry.
// Every result carries the generation it was produced under; a superseded result is
// dropped, never painted (RULE 24). No React here: the session is testable as logic.

import { createPreviewCache, type CacheDeps, type PreviewCache } from "./previewcache";
import { createPreviewQueue, type PreviewQueue, type PreviewRow, type Progress, type QueueEvent } from "./previewqueue";
import { createRowStates, PENDING, type RowPreview, type RowStates } from "./previewstate";
import { stripChunks } from "./previewstrip";
import type { PreviewDeps, StripResult } from "../batch/preview/previewdeps";
import type { DirHandleLike } from "./fs";
import type { SplitSettings } from "./presets";

export interface SessionSpec {
  /** Selected, eligible rows in the user's own list order. */
  rows: { relPath: string }[];
  root: DirHandleLike | null;
  split: SplitSettings;
  /** Near-viewport test by list position (D4); those rows are planned first. */
  near: (index: number) => boolean;
}

export interface PreviewSession {
  states: RowStates;
  /** Plan and run. Any previous generation stops first: it may not paint (D3). */
  start(spec: SessionSpec): void;
  /** Stop the queue; rows that never started are marked as not previewed. */
  stop(): void;
  /** Stop and release everything — the caller is leaving (URLs revoked, RULE 20). */
  close(): void;
  /** The viewport moved: pin what is visible, unpin the rest (D6). */
  setNear(near: (index: number) => boolean): void;
  progress(): Progress;
  isRunning(): boolean;
  /** Resolves when the queue has drained (tests, and the "session finished" toast). */
  settled(): Promise<void>;
  /** Called whenever progress or running changes (the hook re-renders with it). */
  onChange(listener: () => void): () => void;
}

const READING: RowPreview = { state: "reading", urls: [], count: 0, icons: 0, capped: false, message: "Reading…" };
const STOPPED: RowPreview = { state: "stopped", urls: [], count: 0, icons: 0, capped: false, message: "Not previewed" };

interface Ctx {
  deps: PreviewDeps;
  states: RowStates;
  cache: PreviewCache;
  queue: PreviewQueue<StripResult>;
  listeners: Set<() => void>;
  generation: number;
  icons: number;
  running: boolean;
  fingerprint: string;
  planned: string[];
  near: (index: number) => boolean;
}

export function createPreviewSession(deps: PreviewDeps, cacheDeps?: CacheDeps): PreviewSession {
  const ctx = freshCtx(deps, cacheDeps);
  ctx.cache.onDrop((key) => ctx.states.set(relPathOf(key), PENDING)); // a revoked URL is never shown
  ctx.queue.on((event) => handleEvent(ctx, event));
  return apiOf(ctx);
}

function freshCtx(deps: PreviewDeps, cacheDeps?: CacheDeps): Ctx {
  return {
    deps,
    states: createRowStates(),
    cache: createPreviewCache(cacheDeps),
    queue: createPreviewQueue<StripResult>({ pause: deps.pause }),
    listeners: new Set(),
    generation: 0,
    icons: 0,
    running: false,
    fingerprint: "",
    planned: [],
    near: () => false,
  };
}

function apiOf(ctx: Ctx): PreviewSession {
  return {
    states: ctx.states,
    start: (spec) => startSession(ctx, spec),
    stop: () => {
      stopSession(ctx);
      notify(ctx);
    },
    close: () => closeSession(ctx),
    setNear: (near) => {
      ctx.near = near;
      applyPins(ctx);
    },
    progress: () => ({ ...ctx.queue.progress(), icons: ctx.icons }),
    isRunning: () => ctx.running,
    settled: () => ctx.queue.settled(),
    onChange(listener) {
      ctx.listeners.add(listener);
      return () => ctx.listeners.delete(listener);
    },
  };
}

function notify(ctx: Ctx): void {
  for (const l of ctx.listeners) l();
}

// ---- planning ------------------------------------------------------------------

function startSession(ctx: Ctx, spec: SessionSpec): void {
  ctx.queue.cancel(); // the old generation stops here, before it can paint
  ctx.generation += 1;
  ctx.fingerprint = fingerprintOf(spec.split);
  ctx.planned = spec.rows.map((r) => r.relPath);
  ctx.icons = 0;
  ctx.near = spec.near;
  ctx.running = spec.rows.length > 0;
  ctx.states.clear();
  ctx.cache.clear(); // one generation in memory at a time (D6)
  ctx.queue.setRows(spec.rows.map((row, index) => planRow(ctx, spec, row.relPath, index)), ctx.generation);
  notify(ctx);
}

function planRow(ctx: Ctx, spec: SessionSpec, relPath: string, index: number): PreviewRow<StripResult> {
  return {
    key: relPath,
    near: spec.near(index),
    work: async (token) => {
      ctx.states.set(relPath, READING);
      const result = await ctx.deps.work({ root: spec.root, relPath, split: spec.split, token });
      if (result.kind === "ok") ctx.cache.pin(cacheKeyOf(relPath, ctx.fingerprint), ctx.near(index));
      return result;
    },
  };
}

function stopSession(ctx: Ctx): void {
  ctx.running = false;
  ctx.queue.cancel();
  for (const relPath of ctx.planned) {
    const current = ctx.states.get(relPath);
    if (current.state === "pending" || current.state === "reading") ctx.states.set(relPath, STOPPED);
  }
}

function closeSession(ctx: Ctx): void {
  stopSession(ctx);
  ctx.queue.dispose();
  ctx.cache.clear(); // revokes every strip URL (RULE 20)
  ctx.states.clear();
  ctx.listeners.clear();
}

// ---- events --------------------------------------------------------------------

function handleEvent(ctx: Ctx, event: QueueEvent<StripResult>): void {
  if (event.generation !== ctx.generation) return; // stale: never painted (D3)
  applyEvent(ctx, event);
  notify(ctx);
}

function applyEvent(ctx: Ctx, event: QueueEvent<StripResult>): void {
  if (event.kind === "row-done") return finishRow(ctx, event.key, event.value);
  if (event.kind === "idle") {
    ctx.running = false;
    return;
  }
  ctx.states.set(event.key, stateFor(event));
}

function stateFor(event: QueueEvent<StripResult>): RowPreview {
  if (event.kind === "row-empty") return { ...PENDING, state: "empty", message: "No icons at this merge distance" };
  if (event.kind === "row-error" && "message" in event) return { ...PENDING, state: "error", message: event.message };
  return STOPPED;
}

function finishRow(ctx: Ctx, relPath: string, value: StripResult): void {
  const chunks = stripChunks(value.count);
  ctx.icons += value.count;
  const key = cacheKeyOf(relPath, ctx.fingerprint);
  const cached = ctx.cache.put({ key, blobs: value.blobs, count: chunks.shown, usedFrac: value.usedFrac });
  if (cached !== "ok") {
    ctx.states.set(relPath, { ...PENDING, state: "error", message: "Preview is larger than the memory budget" });
    return;
  }
  ctx.states.set(relPath, {
    state: chunks.capped ? "capped" : "ready",
    urls: ctx.cache.get(key)?.urls ?? [],
    count: chunks.shown,
    icons: value.count,
    capped: chunks.capped,
    message: chunks.capped ? `first ${chunks.shown} of ${value.count} icons` : `${value.count} icons`,
  });
}

// ---- small helpers -------------------------------------------------------------

/** Which of the planned rows are visible right now (D6: visible rows are pinned). */
function applyPins(ctx: Ctx): void {
  ctx.planned.forEach((relPath, index) => ctx.cache.pin(cacheKeyOf(relPath, ctx.fingerprint), ctx.near(index)));
}

function fingerprintOf(split: SplitSettings): string {
  return `${split.mergeFrac ?? "auto"}|${split.padding}|${split.size}|${split.transparent}`;
}

function cacheKeyOf(relPath: string, fingerprint: string): string {
  return `${relPath}\u0000${fingerprint}`;
}

function relPathOf(key: string): string {
  return key.split("\u0000")[0];
}

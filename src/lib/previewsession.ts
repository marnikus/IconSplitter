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
  /** Is this row near the viewport (D4)? Those rows are planned first. Asked by row
   *  identity, because the list order is not the DOM order once a filter hides rows. */
  near: (relPath: string) => boolean;
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
  setNear(near: (relPath: string) => boolean): void;
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
  /** Rows this plan already had a strip for: counted as done, never read again. */
  replayed: number;
  running: boolean;
  fingerprint: string;
  planned: string[];
  near: (relPath: string) => boolean;
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
    replayed: 0,
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
    progress: () => {
      const ran = ctx.queue.progress();
      return { done: ran.done + ctx.replayed, total: ctx.planned.length, icons: ctx.icons };
    },
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
  ctx.near = spec.near;
  ctx.states.clear();
  ctx.icons = 0;
  ctx.replayed = 0;
  // Strips drawn at another merge distance are not this plan's strips: they go now
  // (URLs revoked once). Strips of the SAME settings stay — re-pressing Preview, or
  // adding one row to a thousand, must not redo work the user can already see (D3/D8).
  ctx.cache.keepWhere((key) => settingsOfKey(key) === ctx.fingerprint);
  const todo = spec.rows.map((row) => row.relPath).filter((relPath) => !replayRow(ctx, relPath));
  ctx.running = todo.length > 0;
  ctx.queue.setRows(todo.map((relPath) => planRow(ctx, spec, relPath)), ctx.generation);
  notify(ctx);
}

/** A row this plan already has a strip for: shown at once, never read again. */
function replayRow(ctx: Ctx, relPath: string): boolean {
  const entry = ctx.cache.get(cacheKeyOf(relPath, ctx.fingerprint));
  if (!entry) return false;
  ctx.cache.pin(entry.key, ctx.near(relPath));
  ctx.states.set(relPath, rowPreview(entry.icons, entry.urls));
  ctx.icons += entry.icons;
  ctx.replayed += 1;
  return true;
}

function planRow(ctx: Ctx, spec: SessionSpec, relPath: string): PreviewRow<StripResult> {
  return {
    key: relPath,
    near: spec.near(relPath),
    work: async (token) => {
      ctx.states.set(relPath, READING);
      const result = await ctx.deps.work({ root: spec.root, relPath, split: spec.split, token });
      if (result.kind === "ok") ctx.cache.pin(cacheKeyOf(relPath, ctx.fingerprint), ctx.near(relPath));
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
  const key = cacheKeyOf(relPath, ctx.fingerprint);
  const cached = ctx.cache.put({ key, blobs: value.blobs, count: stripChunks(value.count).shown, icons: value.count, usedFrac: value.usedFrac });
  if (cached !== "ok") {
    ctx.states.set(relPath, { ...PENDING, state: "error", message: "Preview is larger than the memory budget" });
    return;
  }
  ctx.icons += value.count;
  ctx.states.set(relPath, rowPreview(value.count, ctx.cache.get(key)?.urls ?? []));
}

/** What a row says once its strip exists — the same words whether it was just drawn or replayed. */
function rowPreview(icons: number, urls: string[]): RowPreview {
  const chunks = stripChunks(icons);
  return {
    state: chunks.capped ? "capped" : "ready",
    urls,
    count: chunks.shown,
    icons,
    capped: chunks.capped,
    message: chunks.capped ? `first ${chunks.shown} of ${icons} icons` : `${icons} icons`,
  };
}

// ---- small helpers -------------------------------------------------------------

/** Which of the planned rows are visible right now (D6: visible rows are pinned). */
function applyPins(ctx: Ctx): void {
  for (const relPath of ctx.planned) ctx.cache.pin(cacheKeyOf(relPath, ctx.fingerprint), ctx.near(relPath));
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

/** The settings part of a cache key (D8): strips of other settings are not this plan's. */
function settingsOfKey(key: string): string {
  return key.split("\u0000")[1] ?? "";
}

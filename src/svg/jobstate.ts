import { readKey, writeKey } from "../state/safestorage";
// Session-only jobs and source leases; no credentials or controllers persisted.
import { acquireResources, releaseResources } from "../lib/joblocks";
import { newRunId } from "./journal";
import type { BatchOutcome } from "../lib/svgbatch";
import type { DirHandleLike } from "../lib/fs";
import type { RunCtx } from "./runcontext";
import type { RunProgress, SvgRefs, SvgRow } from "./types";

export const SOURCE_BUSY = "This source is in use by another process — wait for it to finish; nothing was changed or sent";
export const MAX_SVG_RUNS = 3;
export interface LockCtx { refs: SvgRefs; rows: readonly SvgRow[]; say: (msg: string, err?: boolean) => void }
export interface RunSnapshot { c: RunCtx; root: DirHandleLike; key: string }
export interface SvgJob {
  id: string; label: string; ids: string[]; keys: string[]; controller: AbortController; requestController: AbortController | null;
  status: "running" | "finished" | "failed" | "cancelled";
  progress: RunProgress | null; current: string | null; outcomes: BatchOutcome[]; summary: string;
}
export interface JobView {
  id: string; label: string; status: SvgJob["status"]; total: number; summary: string; progress: RunProgress | null;
}
interface JobStore {
  locks: Map<string, string>; imageOwners: Set<string>; jobs: SvgJob[]; snapshots: Map<string, RunSnapshot>;
  claims: WeakSet<object>; listeners: Set<() => void>; views: JobView[]; foreground: string | null; wake: () => void;
}
const stores = new WeakMap<SvgRefs, JobStore>();

export function jobStore(refs: SvgRefs): JobStore {
  let store = stores.get(refs);
  if (!store) {
    store = { locks: new Map(), imageOwners: new Set(), jobs: [], snapshots: new Map(), claims: new WeakSet(), listeners: new Set(), views: [], foreground: null, wake: () => undefined };
    stores.set(refs, store);
  }
  return store;
}

export function sourceKeys(c: Pick<LockCtx, "rows">, ids: readonly string[]): string[] {
  return ids.map((id) => (c.rows.find((row) => row.source.id === id)?.source.metaPath ?? id).replace(/\\/g, "/").toLowerCase());
}

export function sourcesBusy(c: Pick<LockCtx, "rows" | "refs">, ids: readonly string[]): boolean {
  return sourceKeys(c, ids).some((key) => jobStore(c.refs).locks.has(key));
}

export function hasJobs(refs: SvgRefs): boolean {
  const store = jobStore(refs);
  return refs.abort.current !== null || refs.queue.current.length > 0 || store.locks.size > 0;
}

/** The synchronous reservation happens before any read/save/request can await. */
export function reserveSources(c: Pick<LockCtx, "refs" | "rows">, ids: readonly string[], kind: "edit" | "image" = "edit"): (() => void) | null {
  const store = jobStore(c.refs);
  const keys = sourceKeys(c, ids);
  const owner = newRunId();
  const waiting = sourceKeys(c, c.refs.queue.current.flatMap((item) => item.ids));
  if (kind === "image" && keys.some((key) => waiting.includes(key))) return null;
  if (!acquireResources(store.locks, owner, keys)) return null;
  if (kind === "image") store.imageOwners.add(owner);
  return () => { store.imageOwners.delete(owner); releaseResources(store.locks, owner, keys); store.wake(); };
}

export function releaseJobRows(refs: SvgRefs, job: SvgJob, keys: readonly string[]): void {
  const store = jobStore(refs);
  releaseResources(store.locks, job.id, keys);
  store.wake();
}

export function publishJobs(refs: SvgRefs): void {
  const store = jobStore(refs);
  store.views = store.jobs.map((job) => ({ id: job.id, label: job.label, status: job.status, total: job.ids.length, summary: job.summary, progress: job.progress }));
  for (const listener of store.listeners) listener();
}

/** Freeze settings/key/root NOW, never when a conflicted job eventually starts. */
export function captureRun(c: RunCtx, id: string): void {
  const root = c.refs.root.current as DirHandleLike;
  jobStore(c.refs).snapshots.set(id, { root, key: c.refs.key.current ?? "", c: { ...c, rows: [...c.rows], m: { ...c.m, config: { ...c.m.config }, params: { ...c.m.params } } } });
}

/** User-selectable provider pressure: serial mode remains supported. */
export function parallelLimit(): number {
  const n = Number(readKey("iconSplitter.svg.parallel.v1"));
  return [1, 2, 3].includes(n) ? n : MAX_SVG_RUNS;
}

export function setParallelLimit(n: number): void {
  writeKey("iconSplitter.svg.parallel.v1", String([1, 2, 3].includes(n) ? n : MAX_SVG_RUNS));
}

export function imagesBusy(c: Pick<LockCtx, "rows" | "refs">, ids: readonly string[]): boolean {
  const store = jobStore(c.refs);
  return sourceKeys(c, ids).some((key) => store.imageOwners.has(store.locks.get(key) ?? ""));
}

// usagestore.ts — reads and writes the per-icon `<svg>.usage.json` files beside the
// approved SVGs, next to their `<svg>.index.json` (2026-11-13). A missing, corrupt
// or foreign file means "never used". Written only when an artboard is exported.
import { ensureDirPath, listChildNames, readTextAt, withDirCache, type DirHandleLike, type FileHandleLike } from "../lib/fs";
import { createLimiter } from "../lib/limiter";
import { bumpUsage, emptyUsage, parseUsageRecord, serializeUsageRecord, usagePathOf, type UsageRecord } from "../lib/svgBuilder/usage";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";

const READ_BATCH = 256;
const ASSET_INDEX = new WeakMap<readonly BuilderIconAsset[], ReadonlyMap<string, BuilderIconAsset>>();

function assetMapOf(assets: readonly BuilderIconAsset[]): ReadonlyMap<string, BuilderIconAsset> {
  let map = ASSET_INDEX.get(assets);
  if (map === undefined) {
    map = new Map(assets.map((a) => [a.id, a]));
    ASSET_INDEX.set(assets, map);
  }
  return map;
}

export async function readUsage(root: DirHandleLike, assets: readonly BuilderIconAsset[]): Promise<Map<string, UsageRecord>> {
  const out = new Map<string, UsageRecord>();
  for (let i = 0; i < assets.length; i += READ_BATCH) {
    const batch = assets.slice(i, i + READ_BATCH);
    const records = await Promise.all(batch.map((a) => readOne(root, a)));
    records.forEach((r, k) => { if (r !== null) out.set(batch[k].id, r); });
  }
  return out;
}

async function readOne(root: DirHandleLike, asset: BuilderIconAsset): Promise<UsageRecord | null> {
  try {
    const text = await readTextAt(root, usagePathOf(asset.svgPath));
    const record = text === null ? null : parseUsageRecord(JSON.parse(text));
    return record !== null && record.id === asset.id ? record : null;
  } catch {
    return null;
  }
}

interface UsageSlot {
  dir: DirHandleLike;
  fileName: string;
  handle: FileHandleLike | null;
  record: UsageRecord | null;
}

type DirEntriesCache = Map<DirHandleLike, Promise<ReadonlySet<string>>>;

function listCachedDirNames(dir: DirHandleLike, cache: DirEntriesCache): Promise<ReadonlySet<string>> {
  let task = cache.get(dir);
  if (task === undefined) {
    task = listChildNames(dir).then((names) => new Set(names));
    cache.set(dir, task);
  }
  return task;
}

async function openUsageSlot(root: DirHandleLike, asset: BuilderIconAsset, dirEntries: DirEntriesCache): Promise<UsageSlot> {
  const path = usagePathOf(asset.svgPath);
  const cut = path.lastIndexOf("/");
  const dir = await ensureDirPath(root, cut < 0 ? "" : path.slice(0, cut));
  const fileName = path.slice(cut + 1);
  if (!(await listCachedDirNames(dir, dirEntries)).has(fileName)) {
    return { dir, fileName, handle: null, record: null };
  }
  try {
    const handle = await dir.getFileHandle(fileName, { create: false });
    const parsed = parseUsageRecord(JSON.parse(await (await handle.getFile()).text()));
    return { dir, fileName, handle, record: parsed !== null && parsed.id === asset.id ? parsed : null };
  } catch {
    return { dir, fileName, handle: null, record: null };
  }
}

async function saveUsageSlot(slot: UsageSlot, record: UsageRecord): Promise<void> {
  const handle = slot.handle ?? await slot.dir.getFileHandle(slot.fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(new Blob([serializeUsageRecord(record)], { type: "application/json" }));
  await writable.close();
}

/**
 * One more export for each icon: re-reads the file first (another window may have
 * counted too), bumps it and writes it back. Answers the new records and the ids
 * that could not be written.
 */
export interface RecordUseArgs {
  root: DirHandleLike;
  assets: readonly BuilderIconAsset[];
  ids: readonly string[];
  /** Which artboard was exported (written to the history). */
  artboard: string;
  at: string;
}

export interface UseBatchEntry {
  ids: readonly string[];
  artboard: string;
  at: string;
}

function groupUseEvents(entries: readonly UseBatchEntry[]): Map<string, Array<{ artboard: string; at: string }>> {
  const byIcon = new Map<string, Array<{ artboard: string; at: string }>>();
  for (const entry of entries) {
    for (const id of entry.ids) {
      let list = byIcon.get(id);
      if (list === undefined) { list = []; byIcon.set(id, list); }
      list.push({ artboard: entry.artboard, at: entry.at });
    }
  }
  return byIcon;
}

export interface UsageBatchSession {
  enqueue(ids: readonly string[], artboard: string, at: string): void;
  flushIcons(ids: readonly string[]): void;
  finish(): Promise<{ records: Map<string, UsageRecord>; failed: string[] }>;
}

interface SessionState {
  cachedRoot: DirHandleLike;
  byId: ReadonlyMap<string, BuilderIconAsset>;
  limit: ReturnType<typeof createLimiter>;
  dirEntries: DirEntriesCache;
  slots: Map<string, Promise<UsageSlot>>;
  eventsByIcon: Map<string, Array<{ artboard: string; at: string }>>;
  writes: Promise<void>[];
  flushed: Set<string>;
  records: Map<string, UsageRecord>;
  failed: string[];
}

function scheduleIconFlush(st: SessionState, id: string): void {
  const asset = st.byId.get(id);
  const events = st.eventsByIcon.get(id);
  if (asset === undefined || events === undefined || events.length === 0 || st.flushed.has(id)) return;
  st.flushed.add(id);
  const slotTask = st.slots.get(id) ?? st.limit(() => openUsageSlot(st.cachedRoot, asset, st.dirEntries));
  st.writes.push((async () => {
    const slot = await slotTask;
    let cur = slot.record ?? emptyUsage(asset.id, asset.svgPath);
    for (const ev of events) cur = bumpUsage(cur, ev.artboard, ev.at);
    try { await saveUsageSlot(slot, cur); st.records.set(id, cur); } catch { st.failed.push(id); }
  })());
}

function enqueueIconEvents(st: SessionState, ids: readonly string[], artboard: string, at: string): void {
  for (const id of ids) {
    let list = st.eventsByIcon.get(id);
    if (list === undefined) { list = []; st.eventsByIcon.set(id, list); }
    list.push({ artboard, at });
  }
}

/** Pipelined usage session: pre-opens icon slots up front and flushes finished icons concurrently with remaining sheet CPU work. */
export function createUsageBatchSession(
  root: DirHandleLike,
  assets: readonly BuilderIconAsset[],
  candidateIds: readonly string[],
): UsageBatchSession {
  const st: SessionState = {
    cachedRoot: withDirCache(root), byId: assetMapOf(assets), limit: createLimiter(READ_BATCH),
    dirEntries: new Map(), slots: new Map(), eventsByIcon: new Map(), writes: [], flushed: new Set(), records: new Map(), failed: [],
  };
  for (const id of candidateIds) {
    const a = st.byId.get(id);
    if (a !== undefined && !st.slots.has(id)) st.slots.set(id, st.limit(() => openUsageSlot(st.cachedRoot, a, st.dirEntries)));
  }
  return {
    enqueue: (ids, artboard, at) => enqueueIconEvents(st, ids, artboard, at),
    flushIcons: (ids) => { for (const id of ids) scheduleIconFlush(st, id); },
    async finish() {
      for (const id of st.eventsByIcon.keys()) scheduleIconFlush(st, id);
      await Promise.all(st.writes);
      return { records: st.records, failed: st.failed };
    },
  };
}

/** Coalesced, parallel usage recording across one or more exported artboards: one read and one write per unique icon. */
export async function recordUseBatch(
  root: DirHandleLike,
  assets: readonly BuilderIconAsset[],
  entries: readonly UseBatchEntry[],
): Promise<{ records: Map<string, UsageRecord>; failed: string[] }> {
  const grouped = groupUseEvents(entries);
  const session = createUsageBatchSession(root, assets, [...grouped.keys()]);
  for (const entry of entries) session.enqueue(entry.ids, entry.artboard, entry.at);
  return session.finish();
}

export async function recordUse(args: RecordUseArgs): Promise<{ records: Map<string, UsageRecord>; failed: string[] }> {
  return recordUseBatch(args.root, args.assets, [{ ids: args.ids, artboard: args.artboard, at: args.at }]);
}

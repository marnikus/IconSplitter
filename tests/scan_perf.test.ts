// scan_perf.test.ts — folder scans ≥ 80 % quicker (2026-11-06). Every tab's
// scan walked the folder and read every pair file strictly one at a time, and a
// tab switch repeated it all. Now the walk opens files in parallel (bounded),
// the bulk pair-file loader reads in parallel, and parsed pair files are kept
// per (folder, path, size, mtime) for the session, so a rescan of an unchanged
// folder reads no pair file at all. Measured on a "slow drive" fake where every
// listing, lookup and open costs 2 ms — the latency-bound case a cloud-synced
// folder is.
import { beforeEach, describe, expect, it } from "vitest";
import { readDirTree, type DirHandleLike } from "../src/lib/fs";
import { walkTree } from "../src/lib/scan";
import { loadPairDecisions, saveMetaAt } from "../src/selection/pairstore";
import { clearPairCache } from "../src/selection/paircache";
import { discoverApprovedSources } from "../src/svg/sources";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairFile } from "./helpers/pairfile";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import type { TreeNode } from "../src/lib/scan";

const MS = 2;
const delay = () => new Promise<void>((r) => setTimeout(r, MS));

interface Meter { ops: number; inFlight: number; peak: number; pairReads: number }

/** Makes every listing, handle lookup and file open of the tree cost MS. */
function slow(dir: FakeDir, m: Meter): FakeDir {
  const timed = async <T>(work: () => Promise<T>): Promise<T> => {
    m.ops += 1; m.inFlight += 1; m.peak = Math.max(m.peak, m.inFlight);
    try { await delay(); return await work(); } finally { m.inFlight -= 1; }
  };
  const entries = dir.entries.bind(dir);
  dir.entries = async function* () {
    const list: [string, FakeDir | FakeFile][] = [];
    await timed(async () => { for await (const e of entries()) list.push(e); });
    yield* list;
  } as typeof dir.entries;
  const gd = dir.getDirectoryHandle.bind(dir);
  dir.getDirectoryHandle = (n, o) => timed(() => gd(n, o));
  const gf = dir.getFileHandle.bind(dir);
  dir.getFileHandle = (n, o) => timed(() => gf(n, o));
  for (const child of dir.children.values()) {
    if (child instanceof FakeDir) slow(child, m);
    else {
      const get = child.getFile.bind(child);
      child.getFile = () => timed(async () => {
        const f = await get();
        if (child.name.endsWith(".svg.json")) {
          const text = f.text.bind(f);
          Object.defineProperty(f, "text", { value: () => { m.pairReads += 1; return text(); } });
        }
        return f;
      });
    }
  }
  return dir;
}

/** `n` approved pairs, 4 files each, two folder levels deep. */
function tree(n: number): FakeDir {
  const root = new FakeDir("root");
  for (let i = 0; i < n; i += 1) {
    const cat = `cat_${i % 10}`;
    const catDir = (root.children.get(cat) as FakeDir | undefined) ?? new FakeDir(cat);
    root.children.set(cat, catDir);
    const dirName = `pair_${i}`;
    const dir = new FakeDir(dirName);
    catDir.children.set(dirName, dir);
    const json = serializePairMeta(pairFile(`${cat}/${dirName}`, `icon_${i}_AI.png`, { decision: "approved" }));
    dir.children.set(`icon_${i}.png`, new FakeFile(`icon_${i}.png`, 12, 2000 + i));
    dir.children.set(`icon_${i}_AI.png`, new FakeFile(`icon_${i}_AI.png`, 20, 3000 + i));
    dir.children.set(`icon_${i}_AI.svg.json`, new FakeFile(`icon_${i}_AI.svg.json`, json.length, 4000 + i, json));
    dir.children.set(`icon_${i}_AI_v1.svg`, new FakeFile(`icon_${i}_AI_v1.svg`, 30, 5000 + i, "<svg/>"));
  }
  return root;
}

/** The old walk, one file at a time — the reference result and the old cost. */
async function sequentialTree(dir: DirHandleLike): Promise<TreeNode> {
  const children: TreeNode[] = [];
  for await (const [, h] of dir.entries()) {
    if (h.kind === "directory") children.push(await sequentialTree(h));
    else { const f = await h.getFile(); children.push({ name: h.name, dir: false, size: f.size, mtime: f.lastModified, error: null }); }
  }
  return { name: dir.name, dir: true, children };
}

const timed = async <T>(work: () => Promise<T>) => { const t0 = performance.now(); const value = await work(); return { value, ms: performance.now() - t0 }; };

/**
 * What one slow operation really costs on THIS machine (a 2 ms timer can wait
 * ~15 ms on Windows): the old one-at-a-time cost is operations × this.
 */
async function perOpMs(): Promise<number> {
  const { ms } = await timed(async () => { for (let i = 0; i < 20; i += 1) await delay(); });
  return ms / 20;
}

beforeEach(() => clearPairCache());

describe("the folder walk", () => {
  it("gives exactly the result of the one-at-a-time walk", { timeout: 60_000 }, async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const root = slow(tree(30), m);
    expect(await readDirTree(root, [])).toEqual(await sequentialTree(root));
  });

  it("is at least 80 % quicker than walking one file at a time, with bounded parallelism", { timeout: 60_000 }, async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const root = slow(tree(120), m);
    const { ms } = await timed(() => readDirTree(root, []));
    const oneAtATime = m.ops * (await perOpMs()); // the old cost: every operation waited for the previous one
    expect(ms).toBeLessThan(oneAtATime * 0.2);
    expect(m.peak).toBeGreaterThan(1);
    expect(m.peak).toBeLessThanOrEqual(24);
  });
});

describe("the pair-file loader", () => {
  async function entriesOf(root: FakeDir) {
    return walkTree(await readDirTree(root, []), []);
  }

  it("reads every pair file once, then serves an unchanged folder from the session cache", async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const root = slow(tree(40), m);
    const first = await loadPairDecisions(root, await entriesOf(root));
    expect(m.pairReads).toBe(40);
    expect(first.metas.size).toBe(40);
    const again = await loadPairDecisions(root, await entriesOf(root));
    expect(m.pairReads).toBe(40); // nothing re-read
    expect([...again.metas.keys()]).toEqual([...first.metas.keys()]);
    expect(again.records).toEqual(first.records);
  });

  it("re-reads a pair file whose size or time changed on disk", async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const raw = tree(5);
    const root = slow(raw, m);
    await loadPairDecisions(root, await entriesOf(root));
    const file = ((raw.children.get("cat_0") as FakeDir).children.get("pair_0") as FakeDir).children.get("icon_0_AI.svg.json") as FakeFile;
    file.mtime += 1; // changed by something outside the app
    const before = m.pairReads;
    await loadPairDecisions(root, await entriesOf(root));
    expect(m.pairReads).toBe(before + 1);
  });

  it("forgets a pair file the app itself writes, even when size and time look the same", async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const root = slow(tree(3), m);
    const entries = await entriesOf(root);
    const first = await loadPairDecisions(root, entries);
    const meta = [...first.metas.values()][0];
    const relPath = `${meta.dirPath}/${meta.ai.name.replace(/\.png$/, ".svg.json")}`;
    await saveMetaAt(root, relPath, { ...meta, decision: "declined" });
    const again = await loadPairDecisions(root, entries); // the same (stale) size/mtime entries
    expect(again.metas.get(meta.id)?.decision).toBe("declined");
  });

  it("keeps two folders' caches apart", async () => {
    const a = tree(2);
    const b = tree(2);
    await loadPairDecisions(a, await entriesOf(a));
    ((b.children.get("cat_0") as FakeDir).children.get("pair_0") as FakeDir).children.set(
      "icon_0_AI.svg.json", new FakeFile("icon_0_AI.svg.json", 1, 4000, "{not json"));
    const out = await loadPairDecisions(b, await entriesOf(b));
    expect(out.corruptFiles).toHaveLength(1); // b's own (broken) file, not a's cached one
  });
});

describe("a Generate SVG rescan", () => {
  it("first scan ≥ 80 % quicker than one-at-a-time; an unchanged rescan reads no pair file", { timeout: 60_000 }, async () => {
    const m: Meter = { ops: 0, inFlight: 0, peak: 0, pairReads: 0 };
    const root = slow(tree(120), m);
    const first = await timed(() => discoverApprovedSources(root));
    const oneAtATime = m.ops * (await perOpMs());
    expect(first.value.sources).toHaveLength(120);
    expect(first.ms).toBeLessThan(oneAtATime * 0.2);
    const reads = m.pairReads;
    const opsBefore = m.ops;
    const again = await timed(() => discoverApprovedSources(root));
    expect(again.value.sources).toHaveLength(120);
    expect(m.pairReads).toBe(reads);
    expect(again.ms).toBeLessThan(oneAtATime * 0.2);
    expect(m.ops - opsBefore).toBeLessThan(opsBefore); // the rescan also skips the pair-file lookups
  });
});

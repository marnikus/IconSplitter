// batch_sync_perf.test.ts — Batch's scan no longer rewrites every state file
// (2026-11-06). After the walk, Batch synced every source group ONE AT A TIME
// and WROTE its <base>.json back on every scan, even when nothing changed —
// hundreds of writes (each a cloud upload on a synced folder) that also moved
// every file's modification time. Now an unchanged group is not written at
// all (only the scan's own top-level timestamp would have differed), changed
// groups are, and groups sync in parallel with the same results in order.
import { describe, expect, it } from "vitest";
import { syncAndCollect } from "../src/batch/statewrite";
import type { AiImageEntry } from "../src/lib/scan";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { meter, perOpMs, slow, timed } from "./helpers/slowfs";

/** `n` sheets, each with one AI image, in their own folder. */
function workspace(n: number): { root: FakeDir; images: AiImageEntry[] } {
  const root = new FakeDir("root");
  const images: AiImageEntry[] = [];
  for (let i = 0; i < n; i += 1) {
    const dir = new FakeDir(`set_${i}`);
    root.children.set(`set_${i}`, dir);
    dir.children.set(`sheet_${i}_AI.png`, new FakeFile(`sheet_${i}_AI.png`, 100 + i, 9000 + i));
    images.push({
      name: `sheet_${i}_AI.png`, relPath: `set_${i}/sheet_${i}_AI.png`, dirPath: `set_${i}`, size: 100 + i, mtime: 9000 + i, error: null,
      ai: { base: `sheet_${i}`, suffix: "", stem: `sheet_${i}_AI` }, refRelPath: null,
    } as unknown as AiImageEntry);
  }
  return { root, images };
}

/** Counts every write of a state file (<base>.json) in the tree. */
function countWrites(dir: FakeDir, into: { n: number }): void {
  const get = dir.getFileHandle.bind(dir);
  dir.getFileHandle = async (name, opts) => {
    const fh = await get(name, opts);
    if (name.endsWith(".json") && !(fh as unknown as { counted?: boolean }).counted) {
      const make = fh.createWritable.bind(fh);
      fh.createWritable = async () => { into.n += 1; return make(); };
      (fh as unknown as { counted?: boolean }).counted = true;
    }
    return fh;
  };
  for (const c of dir.children.values()) if (c instanceof FakeDir) countWrites(c, into);
}

const args = (root: FakeDir, images: AiImageEntry[], now: string) => ({ root, images, prevKeys: [], overrides: new Map(), now });

describe("Batch state sync", () => {
  it("writes each state file on the first scan, then nothing while nothing changed", async () => {
    const { root, images } = workspace(10);
    const writes = { n: 0 };
    countWrites(root, writes);
    const first = await syncAndCollect(args(root, images, "2026-11-06T10:00:00.000Z"));
    expect(writes.n).toBe(10);
    const again = await syncAndCollect(args(root, images, "2026-11-06T11:00:00.000Z"));
    expect(writes.n).toBe(10); // a later scan of the same folder writes nothing
    expect([...again.statuses]).toEqual([...first.statuses]);
    expect(again.keys).toEqual(first.keys);
  });

  it("still writes the group whose image changed", async () => {
    const { root, images } = workspace(5);
    const writes = { n: 0 };
    countWrites(root, writes);
    await syncAndCollect(args(root, images, "2026-11-06T10:00:00.000Z"));
    const changed = images.map((img, i) => (i === 2 ? { ...img, size: img.size + 1 } : img));
    await syncAndCollect(args(root, changed, "2026-11-06T11:00:00.000Z"));
    expect(writes.n).toBe(6);
  });

  it("an unchanged rescan on a slow drive is ≥ 80 % quicker than syncing one group at a time", { timeout: 120_000 }, async () => {
    const { root, images } = workspace(60);
    await syncAndCollect(args(root, images, "2026-11-06T10:00:00.000Z")); // the files exist now
    const m = meter();
    slow(root, m);
    const again = await timed(() => syncAndCollect(args(root, images, "2026-11-06T11:00:00.000Z")));
    // The old cost: every group's lookup + read + its WRITE (open, write, close), one at a time.
    const oldMs = (m.ops + images.length * 2) * (await perOpMs());
    expect(again.ms).toBeLessThan(oldMs * 0.2);
    expect(m.peak).toBeGreaterThan(1);
  });
});

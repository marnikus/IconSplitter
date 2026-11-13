// slowfs.ts — a "slow drive" over the in-memory fakes (2026-11-06): every
// listing, handle lookup and file open waits MS, the latency-bound case a
// cloud-synced folder is. The meter counts operations, the peak in flight and
// reads of chosen files, so a test can compare a new scan with the old cost.
import { FakeDir, FakeFile } from "./fakefs";

export const MS = 2;
const delay = () => new Promise<void>((r) => setTimeout(r, MS));

export interface Meter { ops: number; inFlight: number; peak: number; reads: Record<string, number> }

export function meter(): Meter {
  return { ops: 0, inFlight: 0, peak: 0, reads: {} };
}

/** Counts text/arrayBuffer reads of files whose name ends with one of `watch`. */
function counted(file: File, name: string, m: Meter, watch: readonly string[]): File {
  const key = watch.find((w) => name.endsWith(w));
  if (key === undefined) return file;
  for (const method of ["text", "arrayBuffer"] as const) {
    const real = file[method].bind(file);
    Object.defineProperty(file, method, { value: () => { m.reads[key] = (m.reads[key] ?? 0) + 1; return real(); } });
  }
  return file;
}

/** Makes every operation of the tree cost MS (in place); returns the same root. */
export function slow(dir: FakeDir, m: Meter, watch: readonly string[] = []): FakeDir {
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
    if (child instanceof FakeDir) slow(child, m, watch);
    else {
      const get = child.getFile.bind(child);
      child.getFile = () => timed(async () => counted(await get(), child.name, m, watch));
    }
  }
  return dir;
}

export const timed = async <T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const t0 = performance.now();
  const value = await work();
  return { value, ms: performance.now() - t0 };
};

/** What one slow operation really costs on THIS machine (a 2 ms timer can wait ~15 ms on Windows). */
export async function perOpMs(): Promise<number> {
  const { ms } = await timed(async () => { for (let i = 0; i < 20; i += 1) await delay(); });
  return ms / 20;
}

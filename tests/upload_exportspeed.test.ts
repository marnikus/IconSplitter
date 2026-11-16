// upload_exportspeed.test.ts — the export-speed pieces that are not the worker
// pool (2026-11-08): the byte comparison, the per-batch directory-handle cache,
// the path tokenizer's memo, and the lane count of an export batch. Each runs for
// real against the in-memory fakes (RULE 8).
import { describe, expect, it } from "vitest";
import { sameBytes } from "../src/upload/exportcommit";
import { ensureDirPath, fileExistsAt, probePath, readTextAt, withDirCache } from "../src/lib/fs";
import { tokenizePath } from "../src/lib/upload/geom/path";
import { exportLanes } from "../src/upload/exportactions";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import type { UploadCtx } from "../src/upload/actions";
import { FakeDir, FakeFile } from "./helpers/fakefs";

describe("sameBytes — word-wise when aligned, byte-wise otherwise, never wrong", () => {
  const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);

  it.each([0, 1, 3, 4, 5, 7, 8, 1023, 4096, 100003])("equal copies of %i bytes compare equal", (n) => {
    expect(sameBytes(bytes(n), bytes(n))).toBe(true);
  });

  it.each([1, 4, 5, 8, 1023, 100003])("a single flipped byte at the start, the middle and the very end of %i bytes is found", (n) => {
    for (const at of [0, n >> 1, n - 1]) {
      const other = bytes(n); other[at] ^= 0x40;
      expect(sameBytes(bytes(n), other)).toBe(false);
    }
  });

  it("different lengths are never equal", () => {
    expect(sameBytes(bytes(8), bytes(9))).toBe(false);
  });

  it("views at an unaligned offset take the byte-wise path and still compare correctly", () => {
    const whole = bytes(64);
    const a = whole.subarray(1, 33); const b = new Uint8Array(whole.subarray(1, 33));
    expect(a.byteOffset % 4).toBe(1);
    expect(sameBytes(a, b)).toBe(true);
    b[31] ^= 1;
    expect(sameBytes(a, b)).toBe(false);
  });
});

/** A FakeDir that counts the folder lookups it serves. */
class CountingDir extends FakeDir {
  constructor(name: string, public lookups: { n: number }) { super(name); }
  override async getDirectoryHandle(n: string, opts?: { create?: boolean }): Promise<FakeDir> {
    this.lookups.n += 1;
    const c = this.children.get(n);
    if (c instanceof FakeDir) return c;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const d = new CountingDir(n, this.lookups);
    this.children.set(n, d);
    return d;
  }
}

describe("withDirCache — a folder is resolved once per batch", () => {
  async function tree() {
    const lookups = { n: 0 };
    const root = new CountingDir("root", lookups);
    const deep = await ensureDirPath(root, "2026-11/2026-11-02/asset 1/pair/split_02/export");
    (deep as FakeDir).children.set("fog.svg", new FakeFile("fog.svg", 3, 1, "<svg/>"));
    lookups.n = 0;
    return { root, lookups };
  }

  it("without the cache every read walks the whole path again", async () => {
    const { root, lookups } = await tree();
    for (let i = 0; i < 3; i += 1) await readTextAt(root, "2026-11/2026-11-02/asset 1/pair/split_02/export/fog.svg");
    expect(lookups.n).toBe(18);
  });

  it("with the cache the six levels are looked up once, whatever the helper (read, probe, ensure)", async () => {
    const { root, lookups } = await tree();
    const cached = withDirCache(root);
    const path = "2026-11/2026-11-02/asset 1/pair/split_02/export";
    expect(await readTextAt(cached, `${path}/fog.svg`)).toBe("<svg/>");
    expect(await fileExistsAt(cached, `${path}/fog.svg`)).toBe(true);
    expect(await fileExistsAt(cached, `${path}/fog.jpg`)).toBe(false);
    expect(await probePath(cached, path)).not.toBeNull();
    await ensureDirPath(cached, path);
    expect(lookups.n).toBe(6);
  });

  it("lookups in flight at the same time share one request", async () => {
    const { root, lookups } = await tree();
    const cached = withDirCache(root);
    const all = await Promise.all(Array.from({ length: 8 }, () => cached.getDirectoryHandle("2026-11", { create: false })));
    expect(new Set(all).size).toBe(1);
    expect(lookups.n).toBe(1);
  });

  it("a missing folder is not remembered: once it exists it is found", async () => {
    const lookups = { n: 0 };
    const cached = withDirCache(new CountingDir("root", lookups));
    await expect(cached.getDirectoryHandle("export", { create: false })).rejects.toThrow();
    const made = await cached.getDirectoryHandle("export", { create: true });
    expect(await cached.getDirectoryHandle("export", { create: false })).toBe(made);
    expect(lookups.n).toBe(2);
  });

  it("removing an entry makes the next lookup ask again", async () => {
    const { root } = await tree();
    const cached = withDirCache(root);
    await cached.getDirectoryHandle("2026-11");
    await cached.removeEntry!("2026-11", { recursive: true });
    await expect(cached.getDirectoryHandle("2026-11", { create: false })).rejects.toThrow();
  });

  it("files are never cached: a read always sees the file as it is now", async () => {
    const { root } = await tree();
    const cached = withDirCache(root);
    const path = "2026-11/2026-11-02/asset 1/pair/split_02/export";
    expect(await readTextAt(cached, `${path}/fog.svg`)).toBe("<svg/>");
    const dir = await probePath(root, path) as FakeDir;
    (dir.children.get("fog.svg") as FakeFile).text = "<svg changed/>";
    expect(await readTextAt(cached, `${path}/fog.svg`)).toBe("<svg changed/>");
  });
});

describe("tokenizePath — remembered by path string, shared and read-only", () => {
  it("returns the same steps for the same path, and correct steps for each", () => {
    const a = tokenizePath("M10 20 L30 40 z");
    expect(a).toEqual([{ cmd: "M", nums: [10, 20] }, { cmd: "L", nums: [30, 40] }, { cmd: "z", nums: [] }]);
    expect(tokenizePath("M10 20 L30 40 z")).toBe(a);
    expect(tokenizePath("m1 2 3 4")).toEqual([{ cmd: "m", nums: [1, 2] }, { cmd: "l", nums: [3, 4] }]);
    expect(tokenizePath("M10 20 L30 40 z")).toBe(a);
  });

  it("a long run of distinct paths stays correct (the memo is bounded and restarts)", () => {
    for (let i = 0; i < 1500; i += 1) {
      expect(tokenizePath(`M${i} ${i + 1}h${i + 2}`)).toEqual([{ cmd: "M", nums: [i, i + 1] }, { cmd: "h", nums: [i + 2] }]);
    }
    expect(tokenizePath("M0 1h2")).toEqual([{ cmd: "M", nums: [0, 1] }, { cmd: "h", nums: [2] }]);
  });
});

describe("exportLanes — icons in flight at once", () => {
  const ctx = (over: Record<string, Record<string, unknown>> = {}, defaults: Record<string, unknown> = {}) => ({
    m: { defaults: { ...DEFAULT_UPLOAD_SETTINGS, ...defaults }, overrides: over, applied: {} },
  }) as unknown as UploadCtx;

  it("is bounded by the number of icons and by the JPEG worker pool", () => {
    expect(exportLanes(ctx(), ["a"])).toBe(1);
    expect(exportLanes(ctx(), ["a", "b"])).toBe(2);
    const many = Array.from({ length: 50 }, (_, i) => `r${i}`);
    expect(exportLanes(ctx(), many)).toBeGreaterThanOrEqual(2);
    expect(exportLanes(ctx(), many)).toBeLessThanOrEqual(6);
  });

  it("is ONE when any selected row writes its EPS through the Inkscape helper", () => {
    const ids = ["a", "b", "c", "d"];
    expect(exportLanes(ctx({ c: { includeEps: true, epsConverter: "inkscape" } }), ids)).toBe(1);
    expect(exportLanes(ctx({}, { includeEps: true, epsConverter: "inkscape" }), ids)).toBe(1);
    expect(exportLanes(ctx({ c: { includeEps: true, epsConverter: "builtin" } }), ids)).toBeGreaterThan(1);
  });
});

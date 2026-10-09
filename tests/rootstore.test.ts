// rootstore.test.ts — RULE 13: a captured path is persisted WITH the folder it
// was captured for (a handle record in IndexedDB), never under a folder NAME.
// The third report (2026-10-09) came from a name-keyed store: every
// `_split_output` in the user's tree shared one memory slot and the row showed
// another folder's path. Identity here is the platform's own (`isSameEntry`), so
// two same-named folders can never read each other's record, and a corrupt or
// hand-edited payload is no memory at all — never a guess. Only the IDB
// transport is in-memory here (a fake handle cannot survive structured clone —
// the real FileSystemDirectoryHandle can); every rule below is the real code.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";
import { forgetStoredRootPaths, lookupRootPath, persistRootPath } from "../src/lib/rootstore";

/** The in-memory stand-in for the `rootpaths` object store. */
const store = vi.hoisted(() => ({ data: new Map<string, unknown>() }));

vi.mock("../src/batch/store", () => ({
  ROOTPATHS_STORE: "rootpaths",
  idbPut: async (_store: string, key: string, value: unknown) => { store.data.set(key, value); return true; },
  idbGet: async (_store: string, key: string) => store.data.get(key) ?? null,
  idbDelete: async (_store: string, key: string) => { store.data.delete(key); return true; },
}));

/** A plain directory handle that can answer the platform's identity question. */
function dir(name: string, twin?: DirHandleLike): DirHandleLike {
  const handle: { kind: string; name: string; _twin?: unknown; isSameEntry: (other: DirHandleLike) => Promise<boolean> } = {
    kind: "directory",
    name,
    _twin: twin,
    isSameEntry: async (other: DirHandleLike): Promise<boolean> => {
      const o = other as unknown;
      return o === handle || o === twin || (o as { _twin?: unknown } | null)?._twin === handle;
    },
  };
  return handle as unknown as DirHandleLike;
}

beforeEach(() => {
  store.data.clear();
  localStorage.clear();
});

describe("rootstore — a path survives with the folder it was captured for", () => {
  it("round-trips by handle identity, not by name", async () => {
    const mine = dir("_split_output");
    await persistRootPath(mine, { path: "F:\\single\\test_process_3\\_split_output", how: "copied" });
    expect(await lookupRootPath(mine)).toEqual({ path: "F:\\single\\test_process_3\\_split_output", how: "copied" });
  });

  it("two folders with ONE name keep their own records — the third report", async () => {
    const mine = dir("_split_output");
    const other = dir("_split_output");
    await persistRootPath(mine, { path: "F:\\single\\test_process_3\\_split_output", how: "copied" });
    await persistRootPath(other, { path: "F:\\test_processing_2\\_split_output\\2026-10\\run\\export\\test_process_3\\_split_output", how: "copied" });
    expect((await lookupRootPath(mine)).path).toBe("F:\\single\\test_process_3\\_split_output");
    expect((await lookupRootPath(other)).path).toBe("F:\\test_processing_2\\_split_output\\2026-10\\run\\export\\test_process_3\\_split_output");
  });

  it("a restored handle (a fresh object for the same folder) finds its record", async () => {
    const mine = dir("_split_output");
    const restored = dir("_split_output", mine); // `isSameEntry` says: one and the same
    await persistRootPath(mine, { path: "F:\\single\\_split_output", how: "copied" });
    expect(await lookupRootPath(restored)).toEqual({ path: "F:\\single\\_split_output", how: "copied" });
  });

  it("an unknown folder has no memory — never a same-named folder's", async () => {
    await persistRootPath(dir("_split_output"), { path: "F:\\a\\_split_output", how: "copied" });
    expect(await lookupRootPath(dir("_split_output"))).toEqual({ path: "", how: null });
  });

  it("a handle whose identity check throws has no memory — never a name match", async () => {
    const mine = dir("x");
    await persistRootPath(mine, { path: "F:\\x", how: "copied" });
    const lost = {
      kind: "directory", name: "x",
      isSameEntry: async () => { throw new Error("gone"); },
    } as unknown as DirHandleLike;
    expect(await lookupRootPath(lost)).toEqual({ path: "", how: null });
  });

  it("a record whose path is not a folder path is ignored on read (RULE 13)", async () => {
    const mine = dir("test_process_3");
    await persistRootPath(mine, { path: "<svg onload=x>", how: "copied" }); // refused on write
    expect(await lookupRootPath(mine)).toEqual({ path: "", how: null });
    store.data.set("all", [{ handle: dir("j"), path: "hello world", how: "copied" }]); // junk from an older build
    expect(await lookupRootPath(dir("j"))).toEqual({ path: "", how: null });
  });

  it("a corrupt or absent payload is no memory, never a crash", async () => {
    expect(await lookupRootPath(dir("x"))).toEqual({ path: "", how: null });
    store.data.set("all", "corrupt-not-even-a-list");
    expect(await lookupRootPath(dir("x"))).toEqual({ path: "", how: null });
    const mine = dir("x");
    await persistRootPath(mine, { path: "F:\\x", how: "copied" });
    await forgetStoredRootPaths();
    expect(await lookupRootPath(mine)).toEqual({ path: "", how: null });
  });
});

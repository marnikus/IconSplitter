// pathmemory.test.ts — RULE 4/8/13: the ONE owner of "which folder has which
// full path", keyed by the HANDLE and not by the name (I-63). Everything here
// is a proof the platform gave: an exact capture for this handle, or a captured
// folder it is provably below / above. Two folders that merely share a NAME are
// two folders — that name-keyed memory is what showed
// `…\split_03\export\test_process_3\_split_output` three fixes running.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pathFor, pathRevision, peekPath, recordedPaths, rememberPath, resetPathMemory, subscribePaths,
  type PathStore, type StoredPath,
} from "../src/lib/pathmemory";
import { FakeDir } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";

const SINGLE = "F:\\Stocks 2026\\icons testing\\single";
const OLD_EXPORT = `${SINGLE}\\test_processing_2\\_split_output\\2026-10\\run\\piece_AI_10\\split_03\\export`;

/** A store that keeps object identity — the durable double (RULE 8). */
function memoryStore(initial: StoredPath[] = []): PathStore & { rows: () => StoredPath[] } {
  let rows = [...initial];
  return {
    read: async () => rows,
    write: async (next) => { rows = [...next]; },
    rows: () => rows,
  };
}

const bare = (name: string): DirHandleLike => ({ kind: "directory", name }) as DirHandleLike;

let store: ReturnType<typeof memoryStore>;

beforeEach(() => {
  store = memoryStore();
  resetPathMemory(store);
  localStorage.clear();
});

describe("an exact capture — the only thing that is ever stored", () => {
  it("answers the captured path for the handle it was captured for", async () => {
    const root = new FakeDir("test_process_3");
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    expect(await pathFor(root)).toEqual({ path: `${SINGLE}\\test_process_3`, how: "copied" });
    expect(peekPath(root)).toEqual({ path: `${SINGLE}\\test_process_3`, how: "copied" });
  });

  it("answers it for the same folder picked again in another session", async () => {
    const root = new FakeDir("test_process_3");
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    expect(await pathFor(root.alias())).toEqual({ path: `${SINGLE}\\test_process_3`, how: "copied" });
  });

  it("forgives Explorer's quotes, a trailing separator and forward slashes", async () => {
    const root = new FakeDir("test_process_3");
    await rememberPath(root, `"${SINGLE}/test_process_3\\"`);
    expect((await pathFor(root)).path).toBe(`${SINGLE}\\test_process_3`);
  });

  it("refuses markup, a URL, a word and a file name — and keeps the previous path", async () => {
    const root = new FakeDir("test_process_3");
    for (const junk of ["<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", "hello", "icon_AI.png", ""]) {
      expect((await rememberPath(root, junk)).path).toBe("");
    }
    expect(store.rows()).toEqual([]);
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    expect((await rememberPath(root, "https://example.com/x")).path).toBe(`${SINGLE}\\test_process_3`);
  });

  it("lets the newest capture for a handle win, and only for that handle", async () => {
    const first = new FakeDir("_split_output");
    const second = new FakeDir("_split_output"); // a DIFFERENT folder that shares the name
    await rememberPath(first, `${SINGLE}\\test_processing_2\\_split_output`);
    await rememberPath(second, `${SINGLE}\\test_process_3\\_split_output`);
    expect((await pathFor(first)).path).toBe(`${SINGLE}\\test_processing_2\\_split_output`);
    expect((await pathFor(second)).path).toBe(`${SINGLE}\\test_process_3\\_split_output`);
  });
});

describe("the proof search — a folder the app can place without the clipboard", () => {
  it("names a folder BELOW a captured one by joining the segments resolve reports", async () => {
    const out = new FakeDir("_split_output");
    const run = await (await out.getDirectoryHandle("2026-10", { create: true })).getDirectoryHandle("2026-10-09_18-46-23", { create: true });
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    expect(await pathFor(run)).toEqual({
      path: `${SINGLE}\\test_processing_2\\_split_output\\2026-10\\2026-10-09_18-46-23`, how: "derived",
    });
  });

  it("names a folder ABOVE a captured one by trimming the captured path (Failure B)", async () => {
    const run = new FakeDir("2026-10-09_18-46-23"); // the pick: two levels up
    const deep = await (await run.getDirectoryHandle("piece_AI_10", { create: true })).getDirectoryHandle("split_03", { create: true });
    await rememberPath(deep, `${SINGLE}\\test_processing_2\\_split_output\\2026-10\\2026-10-09_18-46-23\\piece_AI_10\\split_03`);
    expect(await pathFor(run)).toEqual({
      path: `${SINGLE}\\test_processing_2\\_split_output\\2026-10\\2026-10-09_18-46-23`, how: "derived",
    });
  });

  it("prefers the NEWEST capture that can place the pick", async () => {
    const main = new FakeDir("test_processing_2");
    const out = await main.getDirectoryHandle("_split_output", { create: true });
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`); // older capture
    await rememberPath(main, "E:\\moved\\test_processing_2"); // newer: the folder moved on disk
    expect((await pathFor(month)).path).toBe("E:\\moved\\test_processing_2\\_split_output\\2026-10");
  });

  it("says NOTHING for a folder in another tree, however similar the names (Failure A)", async () => {
    await rememberPath(new FakeDir("export"), OLD_EXPORT);
    const sibling = new FakeDir("test_process_3"); // a sibling tree, not below `export`
    expect(await pathFor(sibling)).toEqual({ path: "", how: null });
    expect(peekPath(sibling)).toEqual({ path: "", how: null });
  });

  it("says NOTHING for a folder that only shares a NAME with a captured one", async () => {
    await rememberPath(new FakeDir("_split_output"), `${SINGLE}\\test_processing_2\\_split_output`);
    expect(await pathFor(new FakeDir("_split_output"))).toEqual({ path: "", how: null });
  });

  it("never stores a derived answer, so a wrong base has nothing to multiply from", async () => {
    const out = new FakeDir("_split_output");
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    expect((await pathFor(month)).how).toBe("derived");
    expect(recordedPaths().map((r) => r.path)).toEqual([`${SINGLE}\\test_processing_2\\_split_output`]);
    expect(store.rows()).toHaveLength(1);
  });

  it("trims to a drive or share root, and refuses to trim through one", async () => {
    const share = new FakeDir("share");
    const deep = await share.getDirectoryHandle("deep", { create: true });
    await rememberPath(deep, "\\\\server\\share\\deep");
    expect((await pathFor(share)).path).toBe("\\\\server\\share"); // the share root is a real answer

    resetPathMemory(memoryStore());
    const top = new FakeDir("top");
    const bottom = await (await top.getDirectoryHandle("mid", { create: true })).getDirectoryHandle("low", { create: true });
    await rememberPath(bottom, "F:\\low"); // a capture too short to trim two levels
    expect(await pathFor(top)).toEqual({ path: "", how: null });
  });

  it("answers nothing for an inert or foreign handle — no resolve, no isSameEntry", async () => {
    await rememberPath(new FakeDir("_split_output"), `${SINGLE}\\test_processing_2\\_split_output`);
    expect(await pathFor(bare("_split_output"))).toEqual({ path: "", how: null });
    expect(await pathFor(null)).toEqual({ path: "", how: null });
  });
});

describe("the durable record list", () => {
  it("survives a reload: the captures read back and still name their folders", async () => {
    const root = new FakeDir("test_process_3");
    const child = await root.getDirectoryHandle("_split_output", { create: true });
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    expect(store.rows()).toHaveLength(1);
    resetPathMemory(store); // the page reloaded; the store is the same
    expect(await pathFor(child)).toEqual({ path: `${SINGLE}\\test_process_3\\_split_output`, how: "derived" });
  });

  it("ignores a record it cannot use: no handle, a bad path, a corrupt row", async () => {
    const root = new FakeDir("test_process_3");
    resetPathMemory(memoryStore([
      { handle: null as unknown as DirHandleLike, path: `${SINGLE}\\test_process_3`, at: 1 },
      { handle: root, path: "<svg></svg>", at: 2 },
      { handle: root, path: `${SINGLE}\\test_process_3`, at: 3 },
    ]));
    expect(await pathFor(root)).toEqual({ path: `${SINGLE}\\test_process_3`, how: "copied" });
    expect(recordedPaths()).toHaveLength(1);
  });

  it("keeps the list bounded — the newest captures are the ones kept", async () => {
    for (let i = 0; i < 60; i++) await rememberPath(new FakeDir(`f${i}`), `F:\\work\\f${i}`);
    expect(recordedPaths().length).toBeLessThanOrEqual(40);
    expect(store.rows().length).toBeLessThanOrEqual(40);
  });

  it("survives a store that refuses to read or write — the session keeps working (RULE 13)", async () => {
    resetPathMemory({
      read: async () => { throw new Error("no storage"); },
      write: async () => { throw new Error("no storage"); },
    });
    const root = new FakeDir("test_process_3");
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    expect((await pathFor(root)).path).toBe(`${SINGLE}\\test_process_3`);
  });
});

describe("the legacy name-keyed memory is retired (I-63/D2)", () => {
  it("is purged on load and never read back, whatever it holds", async () => {
    localStorage.setItem("iconSplitter.rootpaths.v1", JSON.stringify({
      test_process_3: { path: `${OLD_EXPORT}\\test_process_3`, how: "copied" },
    }));
    expect(await pathFor(new FakeDir("test_process_3"))).toEqual({ path: "", how: null });
    expect(localStorage.getItem("iconSplitter.rootpaths.v1")).toBeNull();
  });
});

describe("the live view (RULE 24)", () => {
  it("notifies on a new capture, and not on a repeat of the same one", async () => {
    const root = new FakeDir("test_process_3");
    const seen: number[] = [];
    const off = subscribePaths(() => seen.push(pathRevision()));
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    off();
    expect(seen).toHaveLength(1);
  });

  it("notifies when a proof first becomes available for a folder on screen", async () => {
    const out = new FakeDir("_split_output");
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    const listener = vi.fn();
    const off = subscribePaths(listener);
    await pathFor(month); // nothing known yet: no proof, no notification
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    await pathFor(month); // the capture now places it
    off();
    expect(listener).toHaveBeenCalled();
    expect(peekPath(month).path).toBe(`${SINGLE}\\test_processing_2\\_split_output\\2026-10`);
  });
});

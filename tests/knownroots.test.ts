// knownroots.test.ts — RULE 4/13: the browser never tells a page a picked
// folder's drive path, but it does tell it that one folder contains another
// (`FileSystemDirectoryHandle.resolve`). The folders this app has already picked
// are therefore the only honest second source for the full path of the next
// pick (I-51): the descendant's path is the known path plus the segments
// `resolve()` returns. Anything the platform refuses — no `resolve`, null, a
// throw, a handle that is not a directory — must simply yield nothing, never a
// guessed path.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";
import {
  clearKnownRoots, deriveRootPath, knownRootPath, knownRoots, publishKnownRootPath, rememberKnownRoot,
  subscribeKnownRoots, updateKnownRootPath,
} from "../src/ui/knownroots";

/** A plain directory handle — what the picker hands back. */
function dir(name: string): DirHandleLike {
  return { kind: "directory", name } as unknown as DirHandleLike;
}

/**
 * A KNOWN folder: the handle the app already picked, whose `resolve` answers the
 * segments from itself down to a pick (`parent.resolve(child)` — the real API).
 */
function ancestorOf(name: string, segments: string[] | null | "throw", hasResolve = true): DirHandleLike {
  const handle: Record<string, unknown> = { kind: "directory", name };
  if (!hasResolve) return handle as unknown as DirHandleLike;
  handle.resolve = async () => {
    if (segments === "throw") throw new Error("not allowed");
    return segments;
  };
  return handle as unknown as DirHandleLike;
}

beforeEach(() => {
  clearKnownRoots();
});

describe("deriveRootPath — where a newly picked folder lives", () => {
  it("completes the path from the folder the app already picked", async () => {
    const out = ancestorOf("_split_output", ["2026-10", "2026-10-05_18-45-20"]);
    rememberKnownRoot(out, "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output");
    expect(await deriveRootPath(dir("2026-10-05_18-45-20"))).toEqual({
      kind: "derived",
      path: "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-05_18-45-20",
    });
  });

  it("prefers the DEEPEST known folder that contains the pick", async () => {
    const deep = ancestorOf("_split_output", ["2026-10-05_18-45-20"]);
    rememberKnownRoot(ancestorOf("main", ["_split_output", "2026-10-05_18-45-20"]), "F:\\work\\test_processing_2");
    rememberKnownRoot(deep, "F:\\work\\test_processing_2\\_split_output");
    expect(await deriveRootPath(dir("2026-10-05_18-45-20"))).toEqual({
      kind: "derived", path: "F:\\work\\test_processing_2\\_split_output\\2026-10-05_18-45-20",
    });
  });

  it("answers the known path itself when the pick IS that folder", async () => {
    const out = ancestorOf("_split_output", []);
    rememberKnownRoot(out, "F:\\work\\test_processing_2\\_split_output");
    expect(await deriveRootPath(out)).toEqual({ kind: "derived", path: "F:\\work\\test_processing_2\\_split_output" });
  });

  it("recognizes a separately restored handle for the same directory", async () => {
    const known = {
      kind: "directory", name: "main",
      isSameEntry: async (other: DirHandleLike) => other.name === "main",
    } as unknown as DirHandleLike;
    const picked = { kind: "directory", name: "main" } as unknown as DirHandleLike;
    rememberKnownRoot(known, "F:\\work\\main");
    expect(await deriveRootPath(picked)).toEqual({ kind: "derived", path: "F:\\work\\main" });
  });

  it("derives a picked parent from an exact known child handle", async () => {
    const parent = ancestorOf("test_process_3", ["_split_output"]);
    rememberKnownRoot(dir("_split_output"), "F:\\Stocks 2026\\icons testing\\single\\test_process_3\\_split_output");
    expect(await deriveRootPath(parent)).toEqual({
      kind: "derived", path: "F:\\Stocks 2026\\icons testing\\single\\test_process_3",
    });
  });

  it("refuses conflicting paths proven by different known handles", async () => {
    rememberKnownRoot(ancestorOf("first", ["child"]), "F:\\work\\first");
    rememberKnownRoot(ancestorOf("second", ["child"]), "D:\\work\\second");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "ambiguous" });
  });

  it("stays silent when no known folder relates to the pick", async () => {
    rememberKnownRoot(ancestorOf("main", null), "F:\\work\\test_processing_2");
    expect(await deriveRootPath(dir("elsewhere"))).toEqual({ kind: "none" });
  });

  it("stays silent when the platform refuses: no resolve, or a throw", async () => {
    rememberKnownRoot(ancestorOf("main", null, false), "F:\\work\\test_processing_2");
    expect(await deriveRootPath(dir("legacy"))).toEqual({ kind: "none" });
    clearKnownRoots();
    rememberKnownRoot(ancestorOf("main", "throw"), "F:\\work\\test_processing_2");
    expect(await deriveRootPath(dir("denied"))).toEqual({ kind: "none" });
  });

  it("never invents a path from a known folder with no captured path", async () => {
    rememberKnownRoot(ancestorOf("main", ["child"]), "");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "none" });
  });

  it("keeps the newest capture for a folder that was picked twice", async () => {
    const main = ancestorOf("main", ["child"]);
    rememberKnownRoot(main, "F:\\one\\main");
    rememberKnownRoot(main, "D:\\two\\main");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "derived", path: "D:\\two\\main\\child" });
    expect(knownRoots().length).toBe(1);
  });

  it("lets a caller seed the registry at boot without duplicating entries", () => {
    const same = ancestorOf("main", []);
    rememberKnownRoot(same, "F:\\work\\main");
    rememberKnownRoot(same, "F:\\work\\main");
    expect(knownRoots()).toEqual([{ handle: same, path: "F:\\work\\main" }]);
  });
});

// A late capture must update only the same directory: the channel shares the
// handle, then `isSameEntry` keeps same-name folders apart (I-36/I-52/I-63).
describe("cross-tab path capture — exact handle, never just its leaf name", () => {
  it("updates the matching same-name handle and leaves its unrelated sibling alone", async () => {
    const main = ancestorOf("main", ["child"]);
    const differentMain = ancestorOf("main", ["different-child"]);
    rememberKnownRoot(main, "");
    rememberKnownRoot(differentMain, "");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "none" });
    await updateKnownRootPath(main, "F:\\work\\main");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "derived", path: "F:\\work\\main\\child" });
    expect(knownRoots()).toEqual([
      { handle: main, path: "F:\\work\\main" },
      { handle: differentMain, path: "" },
    ]);
  });

  it("matches an alias with isSameEntry and accepts the exact new path", async () => {
    const entry = {};
    const local = {
      kind: "directory", name: "main", isSameEntry: async (other: DirHandleLike) => (other as { entry?: object }).entry === entry,
    } as DirHandleLike & { entry: object };
    const received = {
      kind: "directory", name: "main", entry,
    } as unknown as DirHandleLike & { entry: object };
    rememberKnownRoot(local, "F:\\old\\main");
    await updateKnownRootPath(received, "D:\\new\\main");
    expect(knownRootPath(local)).toBe("D:\\new\\main");
  });

  it("learns an exact remote handle so a later child pick can derive its path", async () => {
    const remote = ancestorOf("main", ["child"]);
    await updateKnownRootPath(remote, "F:\\work\\main");
    expect(await deriveRootPath(dir("child"))).toEqual({ kind: "derived", path: "F:\\work\\main\\child" });
  });

  it("publishes a captured handle path to the live cross-tab channel", async () => {
    class EchoChannel {
      static open: EchoChannel[] = [];
      readonly listeners: Array<(event: MessageEvent<unknown>) => void> = [];
      constructor(readonly name: string) { EchoChannel.open.push(this); }
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void { this.listeners.push(listener); }
      postMessage(data: unknown): void {
        for (const channel of EchoChannel.open) {
          if (channel.name === this.name) for (const listener of channel.listeners) listener({ data } as MessageEvent<unknown>);
        }
      }
      close(): void { EchoChannel.open = EchoChannel.open.filter((channel) => channel !== this); }
    }
    vi.stubGlobal("BroadcastChannel", EchoChannel);
    try {
      const entry = {};
      const local = {
        kind: "directory", name: "main", isSameEntry: async (other: DirHandleLike) => (other as { entry?: object }).entry === entry,
      } as DirHandleLike & { entry: object };
      const received = { kind: "directory", name: "main", entry } as unknown as DirHandleLike & { entry: object };
      rememberKnownRoot(local, "F:\\old\\main");
      const unsubscribe = subscribeKnownRoots(() => {});
      publishKnownRootPath(received, "D:\\new\\main");
      await vi.waitFor(() => expect(knownRootPath(local)).toBe("D:\\new\\main"));
      unsubscribe();
    } finally {
      clearKnownRoots();
      vi.unstubAllGlobals();
    }
  });
});

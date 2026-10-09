// knownroots.test.ts — RULE 4/13: the browser never tells a page a picked
// folder's drive path, but it does tell it that one folder contains another
// (`FileSystemDirectoryHandle.resolve`). The folders this app has already picked
// are therefore the only honest second source for the full path of the next
// pick (I-51): the descendant's path is the known path plus the segments
// `resolve()` returns. Anything the platform refuses — no `resolve`, null, a
// throw, a handle that is not a directory — must simply yield nothing, never a
// guessed path.
import { beforeEach, describe, expect, it } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";
import { clearKnownRoots, deriveRootPath, knownRoots, nameKnownRoot, rememberKnownRoot } from "../src/ui/knownroots";

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
    expect(await deriveRootPath(dir("2026-10-05_18-45-20")))
      .toBe("F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-05_18-45-20");
  });

  it("prefers the DEEPEST known folder that contains the pick", async () => {
    const deep = ancestorOf("_split_output", ["2026-10-05_18-45-20"]);
    rememberKnownRoot(ancestorOf("main", ["_split_output", "2026-10-05_18-45-20"]), "F:\\work\\test_processing_2");
    rememberKnownRoot(deep, "F:\\work\\test_processing_2\\_split_output");
    expect(await deriveRootPath(dir("2026-10-05_18-45-20")))
      .toBe("F:\\work\\test_processing_2\\_split_output\\2026-10-05_18-45-20");
  });

  it("answers the known path itself when the pick IS that folder", async () => {
    const out = ancestorOf("_split_output", []);
    rememberKnownRoot(out, "F:\\work\\test_processing_2\\_split_output");
    expect(await deriveRootPath(out)).toBe("F:\\work\\test_processing_2\\_split_output");
  });

  it("stays silent when no known folder contains the pick", async () => {
    rememberKnownRoot(ancestorOf("main", null), "F:\\work\\test_processing_2"); // null: not below it
    expect(await deriveRootPath(dir("elsewhere"))).toBeNull();
  });

  it("stays silent when the platform refuses: no resolve, or a throw", async () => {
    rememberKnownRoot(ancestorOf("main", null, false), "F:\\work\\test_processing_2"); // no resolve() at all
    expect(await deriveRootPath(dir("legacy"))).toBeNull();
    clearKnownRoots();
    rememberKnownRoot(ancestorOf("main", "throw"), "F:\\work\\test_processing_2");
    expect(await deriveRootPath(dir("denied"))).toBeNull();
  });

  it("never invents a path from a known folder with no captured path", async () => {
    rememberKnownRoot(ancestorOf("main", ["child"]), "");
    expect(await deriveRootPath(dir("child"))).toBeNull();
  });

  it("keeps the newest capture for a folder that was picked twice", async () => {
    const main = ancestorOf("main", ["child"]);
    rememberKnownRoot(main, "F:\\one\\main");
    rememberKnownRoot(main, "D:\\two\\main");
    expect(await deriveRootPath(dir("child"))).toBe("D:\\two\\main\\child");
    expect(knownRoots().length).toBe(1);
  });

  it("lets a caller seed the registry at boot without duplicating entries", () => {
    const same = ancestorOf("main", []);
    rememberKnownRoot(same, "F:\\work\\main");
    rememberKnownRoot(same, "F:\\work\\main");
    expect(knownRoots()).toEqual([{ handle: same, path: "F:\\work\\main" }]);
  });
});

// A folder picked with nothing on the clipboard is still a known HANDLE; when
// Rescan or the user's Ctrl+V captures its exact path later (I-52), that
// capture must reach the registry, so the next pick inside it is exact (I-51).
describe("nameKnownRoot — a late capture names the handle already known", () => {
  it("fills the path of every known handle with that name that has none", async () => {
    const main = ancestorOf("main", ["child"]);
    rememberKnownRoot(main, "");
    expect(await deriveRootPath(dir("child"))).toBeNull();
    nameKnownRoot("main", "F:\\work\\main");
    expect(await deriveRootPath(dir("child"))).toBe("F:\\work\\main\\child");
  });

  it("never overwrites a path a handle already has, and ignores unknown names", () => {
    const main = ancestorOf("main", []);
    rememberKnownRoot(main, "D:\\two\\main");
    nameKnownRoot("main", "F:\\one\\main");
    nameKnownRoot("nobody", "F:\\x\\nobody");
    expect(knownRoots()).toEqual([{ handle: main, path: "D:\\two\\main" }]);
  });
});

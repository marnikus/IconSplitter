// knownroots.test.ts — RULE 4/13: the browser never tells a page a picked
// folder's drive path, but it does tell it that one folder contains another
// (`FileSystemDirectoryHandle.resolve`). The folders this app has already
// picked are therefore the honest second source for the full path of the next
// pick (I-51) — in BOTH directions: a pick below a known folder joins the
// segments `known.resolve(pick)` reports; a pick ABOVE a known folder (the
// third report: `test_process_3` while `test_process_3\_split_output` is
// known) strips the segments `pick.resolve(known)` reports. Anything the
// platform refuses must simply yield nothing, never a guessed path.
//
// Since the third report (2026-10-09) a path is bound to the FOLDER (its
// handle), never to its name: two `_split_output` folders keep their own
// paths, and `boundRootPathInfo` answers only for the very folder asked about.
import { beforeEach, describe, expect, it } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";
import {
  rememberKnownRoot, boundRootPathInfo, clearKnownRoots, deriveRootPath, knownRoots,
} from "../src/lib/knownroots";

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

/** The PICK side of a relationship: `pick.resolve(known)` — the reverse direction. */
function containerOf(name: string, segments: string[] | null): DirHandleLike {
  return {
    kind: "directory", name,
    resolve: async (other: unknown) => (other === knownRef ? segments : null),
  } as unknown as DirHandleLike;
}

let knownRef: DirHandleLike | null = null;

beforeEach(() => {
  clearKnownRoots();
  knownRef = null;
});

describe("deriveRootPath — where a newly picked folder lives (I-51)", () => {
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
});

describe("deriveRootPath — the pick may be ABOVE a known folder (one level up)", () => {
  it("strips exactly the segments resolve() reports from the known child — the third report", async () => {
    // `test_process_3\_split_output` was captured exactly; the user picks its
    // PARENT `test_process_3` with nothing on the clipboard — same root, one
    // level up, and the answer is exact
    const pick = containerOf("test_process_3", ["_split_output"]);
    knownRef = ancestorOf("_split_output", null); // the known child: not its ancestor
    rememberKnownRoot(knownRef, "F:\\Stocks 2026\\icons testing\\single\\test_process_3\\_split_output");
    expect(await deriveRootPath(pick)).toBe("F:\\Stocks 2026\\icons testing\\single\\test_process_3");
  });

  it("refuses to strip a tail that does not match — nothing is guessed", async () => {
    const pick = containerOf("test_process_3", ["somewhere", "else"]);
    knownRef = ancestorOf("_split_output", null);
    rememberKnownRoot(knownRef, "F:\\single\\test_process_3\\_split_output");
    expect(await deriveRootPath(pick)).toBeNull();
  });

  it("stays silent when the pick contains no known folder", async () => {
    knownRef = ancestorOf("main", null);
    rememberKnownRoot(knownRef, "F:\\work\\main");
    expect(await deriveRootPath(containerOf("above", null))).toBeNull();
  });
});

describe("boundRootPathInfo — the path is bound to the folder, not the name", () => {
  it("two folders with ONE name keep their own paths — the third report", () => {
    const mine = dir("_split_output");
    const other = dir("_split_output");
    rememberKnownRoot(mine, "F:\\single\\test_process_3\\_split_output");
    rememberKnownRoot(other, "F:\\test_processing_2\\_split_output\\2026-10\\run\\export\\test_process_3\\_split_output");
    expect(boundRootPathInfo(mine).path).toBe("F:\\single\\test_process_3\\_split_output");
    expect(boundRootPathInfo(other).path).toBe("F:\\test_processing_2\\_split_output\\2026-10\\run\\export\\test_process_3\\_split_output");
  });

  it("an unbound handle answers unknown — never a same-named folder's path", () => {
    rememberKnownRoot(dir("_split_output"), "F:\\a\\_split_output");
    expect(boundRootPathInfo(dir("_split_output"))).toEqual({ path: "", how: null });
  });

  it("re-binding the same handle replaces its own path (and keeps one entry)", () => {
    const mine = dir("main");
    rememberKnownRoot(mine, "F:\\one\\main");
    rememberKnownRoot(mine, "D:\\two\\main", "derived");
    expect(boundRootPathInfo(mine)).toEqual({ path: "D:\\two\\main", how: "derived" });
    expect(knownRoots()).toEqual([{ handle: mine, path: "D:\\two\\main", how: "derived" }]);
  });
});

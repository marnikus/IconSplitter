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
import { clearKnownRoots, deriveRootPath, knownRoots, provenOutside, rememberKnownRoot } from "../src/ui/knownroots";

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

// The reported mistake (2026-10-09): the clipboard held a folder path from an
// EARLIER root (`…\\test_processing_2\\_split_output\\…\\split_03\\export`, the
// app's own "copy folder path"), the user picked a sibling tree
// (`…\\single\\test_process_3`), and the picker completed the two into
// `…\\export\\test_process_3`. A known folder that CONTAINS the copied path can
// settle it: its own `resolve(picked)` says whether the pick lies below it at all.
describe("provenOutside — a copied folder a known folder rules out as the parent", () => {
  const OUT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
  const DEEP = `${OUT}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export`;

  it("is true when the copied folder lies under a known folder that does not contain the pick", async () => {
    rememberKnownRoot(ancestorOf("_split_output", null), OUT); // null: the pick is NOT below it
    expect(await provenOutside(dir("test_process_3"), DEEP)).toBe(true);
    expect(await provenOutside(dir("test_process_3"), OUT)).toBe(true); // the known folder itself
  });

  it("forgives case and a trailing separator in the comparison", async () => {
    rememberKnownRoot(ancestorOf("_split_output", null), OUT);
    expect(await provenOutside(dir("x"), `${DEEP.toLowerCase()}\\`)).toBe(true);
  });

  it("is false when the copied folder is not under any known folder", async () => {
    rememberKnownRoot(ancestorOf("_split_output", null), OUT);
    expect(await provenOutside(dir("x"), "F:\\Stocks 2026\\icons testing\\single")).toBe(false);
    expect(await provenOutside(dir("x"), `${OUT}_other\\sub`)).toBe(false); // a sibling with the same prefix
  });

  it("is false when the known folder DOES contain the pick (derivation answers instead)", async () => {
    rememberKnownRoot(ancestorOf("_split_output", ["2026-10", "run"]), OUT);
    expect(await provenOutside(dir("run"), `${OUT}\\2026-10`)).toBe(false);
  });

  it("is false when the platform cannot say: no resolve(), a throw, or no captured path", async () => {
    rememberKnownRoot(ancestorOf("_split_output", null, false), OUT);
    expect(await provenOutside(dir("x"), DEEP)).toBe(false);
    clearKnownRoots();
    rememberKnownRoot(ancestorOf("_split_output", "throw"), OUT);
    expect(await provenOutside(dir("x"), DEEP)).toBe(false);
    clearKnownRoots();
    rememberKnownRoot(ancestorOf("_split_output", null), "");
    expect(await provenOutside(dir("x"), DEEP)).toBe(false);
  });
});

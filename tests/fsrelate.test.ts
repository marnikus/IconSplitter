// fsrelate.test.ts — RULE 4/8: the only thing a browser will vouch for about
// two folder handles is their RELATIONSHIP (`isSameEntry`, `resolve`). This file
// pins that vocabulary, because every full path the app shows is built from it
// (I-63): same, below (with the segments down), above (with the segments up),
// or unproven — and "unproven" must cover a sibling tree, a handle with no
// `resolve`, a platform throw and an inert handle alike, so a missing proof can
// never be mistaken for a negative one.
import { describe, expect, it } from "vitest";
import { relate } from "../src/lib/fsrelate";
import { FakeDir } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";

const bare = (name: string) => ({ kind: "directory", name }) as DirHandleLike;

describe("relate — what the platform proves about two handles", () => {
  it("answers `same` for one handle asked about itself", async () => {
    const a = new FakeDir("main");
    expect(await relate(a, a)).toEqual({ kind: "same" });
  });

  it("answers `same` for two handles of one folder from different sessions", async () => {
    // the real API: isSameEntry compares the underlying entry, not the object
    const a = new FakeDir("main");
    const again = a.alias();
    expect(await relate(a, again)).toEqual({ kind: "same" });
    expect(await relate(again, a)).toEqual({ kind: "same" }); // and the other way round
  });

  it("answers `below` with the segments from the ancestor down to the pick", async () => {
    const out = new FakeDir("_split_output");
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    const run = await month.getDirectoryHandle("2026-10-09_18-46-23", { create: true });
    expect(await relate(out, run)).toEqual({ kind: "below", segments: ["2026-10", "2026-10-09_18-46-23"] });
  });

  it("answers `above` with the segments from the pick down to the known folder", async () => {
    const out = new FakeDir("_split_output");
    const run = await (await out.getDirectoryHandle("2026-10", { create: true })).getDirectoryHandle("2026-10-09_18-46-23", { create: true });
    expect(await relate(run, out)).toEqual({ kind: "above", segments: ["2026-10", "2026-10-09_18-46-23"] });
  });

  it("reads a `resolve` that answers `[]` as the same folder, not as one below", async () => {
    const same = { kind: "directory", name: "main", resolve: async () => [] } as unknown as DirHandleLike;
    expect(await relate(same, bare("main"))).toEqual({ kind: "same" });
  });

  it("answers `unproven` for two folders in different trees", async () => {
    const one = new FakeDir("test_processing_2");
    const other = new FakeDir("test_process_3");
    expect(await relate(one, other)).toEqual({ kind: "unproven" });
  });

  it("answers `unproven` when the platform refuses: no resolve, a throw, an inert handle", async () => {
    const noResolve = bare("main");
    expect(await relate(noResolve, bare("child"))).toEqual({ kind: "unproven" });
    const throwing = {
      kind: "directory", name: "main",
      resolve: async () => { throw new DOMException("not allowed", "SecurityError"); },
    } as unknown as DirHandleLike;
    expect(await relate(throwing, bare("child"))).toEqual({ kind: "unproven" });
    const inert = { kind: "directory", name: "main", resolve: async () => "nope" } as unknown as DirHandleLike;
    expect(await relate(inert, bare("child"))).toEqual({ kind: "unproven" });
  });

  it("never lets a failing isSameEntry hide a relation resolve can still prove", async () => {
    const out = new FakeDir("_split_output");
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    const broken = Object.assign(out, { isSameEntry: async () => { throw new Error("denied"); } });
    expect(await relate(broken, month)).toEqual({ kind: "below", segments: ["2026-10"] });
  });
});

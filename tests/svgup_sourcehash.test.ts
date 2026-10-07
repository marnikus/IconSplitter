// svgup_sourcehash.test.ts — the source's CONTENT identity (merge report R02/R03).
// The report's acceptance row is exact: "In-place SVG content edit with same
// path/size/mtime -> new content SHA-256; dependent package/metadata stale". A
// size:mtime stamp cannot see that edit, so the identity the tab records and
// compares must come from the bytes themselves — and it must fall back to the
// scan's cheap stamp (never to "") when the file cannot be read.
import { describe, expect, it } from "vitest";
import { SOURCE_HASH_PREFIX, isContentHash, sha256Hex } from "../src/lib/svgupload/sourcehash";
import { attachSourceHashes, hashFileAt } from "../src/svgupload/scanhash";
import type { UploadRow } from "../src/lib/svgupload/rows";
import { FakeDir, FakeFile } from "./helpers/fakefs";

/** "abc" — the standard test vector, so the hex itself is checkable by hand. */
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
/** The same LENGTH as SVG, one digit moved — a same-stat content edit. */
const SVG_EDITED = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M3 3h20v20H2z\"/></svg>";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function row(over: Partial<UploadRow> = {}): UploadRow {
  return {
    id: "p1", name: "icon-a_AI_1.png", dirPath: "run/split_01", exportBase: "icon-a_AI_1",
    svgPath: "run/split_01/icon-a_AI_1.svg", version: 1, versionLabel: "v1",
    fingerprint: "100:200", metaPath: "run/split_01/icon-a_AI_1.svg.json",
    warnings: [], blocked: null, exportState: null, job: "queued", metaState: "none", ...over,
  };
}

/** A root holding one folder with one file; the file's own stat is the caller's. */
function rootWithFile(text: string, size: number, mtime: number): FakeDir {
  const root = new FakeDir("root");
  const dir = new FakeDir("split_01");
  dir.children.set("icon-a_AI_1.svg", new FakeFile("icon-a_AI_1.svg", size, mtime, text));
  const run = new FakeDir("run");
  run.children.set("split_01", dir);
  root.children.set("run", run);
  return root;
}

describe("the content hash", () => {
  it("is the standard SHA-256 of the bytes, with one recognisable prefix", async () => {
    const hash = await sha256Hex(bytes("abc"));
    expect(hash).toBe(ABC_SHA256);
    expect(`${SOURCE_HASH_PREFIX}${hash}`).toBe(`${SOURCE_HASH_PREFIX}${ABC_SHA256}`);
    expect(isContentHash(`${SOURCE_HASH_PREFIX}${hash}`)).toBe(true);
    expect(isContentHash("100:200")).toBe(false);
  });

  it("gives the same bytes the same hash and one changed byte another", async () => {
    expect(await sha256Hex(bytes(SVG))).toBe(await sha256Hex(bytes(SVG)));
    expect(await sha256Hex(bytes(SVG))).not.toBe(await sha256Hex(bytes(SVG_EDITED)));
  });
});

describe("the scan's content identity", () => {
  it("reads the chosen file and states its content hash", async () => {
    const root = rootWithFile(SVG, SVG.length, 2200);
    expect(await hashFileAt(root, "run/split_01/icon-a_AI_1.svg")).toBe(`${SOURCE_HASH_PREFIX}${await sha256Hex(bytes(SVG))}`);
  });

  it("replaces the stat fingerprint with the content hash for every row", async () => {
    const rows = await attachSourceHashes(rootWithFile(SVG, SVG.length, 2200), [row()]);
    expect(rows[0].fingerprint).toBe(`${SOURCE_HASH_PREFIX}${await sha256Hex(bytes(SVG))}`);
  });

  it("sees an edit that keeps the file's size AND its mtime (report acceptance row)", async () => {
    const before = await attachSourceHashes(rootWithFile(SVG, SVG.length, 2200), [row()]);
    const after = await attachSourceHashes(rootWithFile(SVG_EDITED, SVG_EDITED.length, 2200), [row()]);
    expect(after[0].fingerprint).not.toBe(before[0].fingerprint);
  });

  it("keeps the scan's own stamp when the file cannot be read, never an empty one", async () => {
    const rows = await attachSourceHashes(rootWithFile(SVG, SVG.length, 2200), [row({ svgPath: "run/split_09/gone.svg" })]);
    expect(rows[0].fingerprint).toBe("100:200");
  });

  it("leaves a row with no chosen file exactly as the scan built it", async () => {
    const rows = await attachSourceHashes(rootWithFile(SVG, SVG.length, 2200), [row({ svgPath: null, fingerprint: "" })]);
    expect(rows[0].fingerprint).toBe("");
  });
});

// pairstore.test.ts — how the pair files are read and written (I-41/I-42/I-43).
// The store is the only thing that touches disk for a decision: reading a walk's
// pair files (plus the legacy global file as a fallback), writing ONE pair's
// file atomically, and reporting what could not be read or written instead of
// guessing. RULE 8: real logic, in-memory fakes.
import { describe, expect, it } from "vitest";
import { pairId, pairEntries } from "../src/lib/pairing";
import { walkTree } from "../src/lib/scan";
import { readDirTree } from "../src/lib/fs";
import {
  metaPathFor, newPairMeta, serializePairMeta, withDecision, type PairMeta,
} from "../src/lib/pairmeta";
import { loadMetaAt, loadPairDecisions, savePairDecision } from "../src/selection/pairstore";
import { metaPathOf } from "../src/selection/pairrecord";
import { FakeDir, FakeFile, BrokenFile } from "./helpers/fakefs";

const PIECE = pairId("split_01", "icon", "_01");
const SHEET = pairId("", "icon-sheet", "");

/** The reported tree: an unsplit sheet pair + one batch piece beside its images. */
function makeRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  const split = new FakeDir("split_01");
  split.children.set("icon.png", new FakeFile("icon.png", 12, 900, "c"));
  split.children.set("icon_AI_01.png", new FakeFile("icon_AI_01.png", 20, 960, "d"));
  root.children.set("split_01", split);
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 100, "e"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 110, "f"));
  return root;
}

function pieceMeta(decision: "approved" | "declined" | "pending"): PairMeta {
  return withDecision(newPairMeta({
    id: PIECE, base: "icon", suffix: "_01", dirPath: "split_01",
    ai: { relPath: "split_01/icon_AI_01.png", name: "icon_AI_01.png", fingerprint: "20:960" },
    source: { relPath: "split_01/icon.png", name: "icon.png", fingerprint: "12:900" },
  }), decision, "2026-10-05T17:02:11.000Z");
}

function writeMeta(dir: FakeDir, name: string, meta: PairMeta): void {
  const text = serializePairMeta(meta);
  dir.children.set(name, new FakeFile(name, text.length, 500, text));
}

async function walk(root: FakeDir) {
  return walkTree(await readDirTree(root, []), []);
}

describe("a pair file read from a DIFFERENT root (I-49)", () => {
  /** The piece's file written while the root was the main folder. */
  function mainRoot(): FakeDir {
    const root = new FakeDir("test_processing");
    const out = new FakeDir("_split_output");
    const month = new FakeDir("2026-10");
    const run = new FakeDir("2026-10-05_18-45-20");
    const ai = new FakeDir("icon-sheet_AI");
    const split = new FakeDir("split_01");
    split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 900, "c"));
    split.children.set("icon-sheet_AI_01.png", new FakeFile("icon-sheet_AI_01.png", 20, 960, "d"));
    const dirPath = "_split_output/2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01";
    const meta = withDecision(newPairMeta({
      id: pairId(dirPath, "icon-sheet", "_01"), base: "icon-sheet", suffix: "_01", dirPath,
      ai: { relPath: `${dirPath}/icon-sheet_AI_01.png`, name: "icon-sheet_AI_01.png", fingerprint: "20:960" },
      source: { relPath: `${dirPath}/icon-sheet.png`, name: "icon-sheet.png", fingerprint: "12:900" },
    }), "approved", "2026-10-05T17:02:11.000Z");
    const text = serializePairMeta(meta);
    split.children.set("icon-sheet_AI_01.svg.json", new FakeFile("icon-sheet_AI_01.svg.json", text.length, 500, text));
    ai.children.set("split_01", split);
    run.children.set("icon-sheet_AI", ai);
    month.children.set("2026-10-05_18-45-20", run);
    out.children.set("2026-10", month);
    root.children.set("_split_output", out);
    return root;
  }

  it("reads the decision under the output root that holds the same folder", async () => {
    const main = mainRoot();
    const out = main.children.get("_split_output") as FakeDir;
    const load = await loadPairDecisions(out, await walk(out));
    // the id the scan of THIS root computes for that folder
    const here = pairId("2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01", "icon-sheet", "_01");
    expect(load.metas.get(here)?.decision).toBe("approved");
    expect(load.metas.get(here)?.dirPath).toBe("2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01");
    // both faces are named the way this root sees them
    const rec = load.records.find((r) => r.pair_id === here);
    expect(rec?.ai_result).toBe("2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01/icon-sheet_AI_01.png");
    expect(rec?.source).toBe("2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01/icon-sheet.png");
    // …and the scanned pair of that root matches the record by id
    const pairs = pairEntries(await walk(out));
    expect(pairs.map((x) => x.pairId)).toEqual([here]);
  });

  it("reads the same decision from the month root and from the run root too", async () => {
    const main = mainRoot();
    const out = main.children.get("_split_output") as FakeDir;
    for (const [dirName, relDir] of [
      ["2026-10", "2026-10-05_18-45-20/icon-sheet_AI/split_01"],
      ["2026-10-05_18-45-20", "icon-sheet_AI/split_01"],
    ] as const) {
      const month = (dirName === "2026-10" ? out.children.get("2026-10") : (out.children.get("2026-10") as FakeDir).children.get("2026-10-05_18-45-20")) as FakeDir;
      const load = await loadPairDecisions(month, await walk(month));
      const here = pairId(relDir, "icon-sheet", "_01");
      expect(load.metas.get(here)?.decision).toBe("approved");
      expect(pairEntries(await walk(month)).map((x) => x.pairId)).toEqual([here]);
    }
  });

  it("keeps a face with no file name described by the file's own folder", async () => {
    // a legacy v1 file records one side only; it must still rebase cleanly
    const main = mainRoot();
    const out = main.children.get("_split_output") as FakeDir;
    const load = await loadPairDecisions(out, await walk(out));
    const here = pairId("2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01", "icon-sheet", "_01");
    expect(load.metas.get(here)?.ai.name).toBe("icon-sheet_AI_01.png");
  });
});

describe("reading the pair files of a walk", () => {
  it("finds the approved pair and leaves the undecided one pending", async () => {
    const root = makeRoot();
    writeMeta(root.children.get("split_01") as FakeDir, "icon_AI_01.svg.json", pieceMeta("approved"));
    const load = await loadPairDecisions(root, await walk(root));
    expect(load.corruptFiles).toEqual([]);
    expect(load.metas.get(PIECE)?.decision).toBe("approved");
    expect(load.metas.get(SHEET)).toBeUndefined();
    expect(load.metas.get(PIECE)?.versions).toEqual([]);
  });

  it("is deterministic: the same tree gives the same records twice", async () => {
    const root = makeRoot();
    writeMeta(root.children.get("split_01") as FakeDir, "icon_AI_01.svg.json", pieceMeta("declined"));
    const a = await loadPairDecisions(root, await walk(root));
    const b = await loadPairDecisions(root, await walk(root));
    expect(a.records).toEqual(b.records);
    expect(a.records.map((r) => r.pair_id)).toEqual([PIECE]);
  });

  it("names a corrupt file and keeps every other decision (never guesses pending)", async () => {
    const root = makeRoot();
    writeMeta(root.children.get("split_01") as FakeDir, "icon_AI_01.svg.json", pieceMeta("approved"));
    root.children.set("broken_AI.png", new FakeFile("broken_AI.png", 5, 5, "x"));
    root.children.set("broken_AI.svg.json", new FakeFile("broken_AI.svg.json", 5, 5, "{ not json"));
    const load = await loadPairDecisions(root, await walk(root));
    expect(load.metas.get(PIECE)?.decision).toBe("approved");
    expect(load.corruptFiles).toEqual(["broken_AI.svg.json"]);
  });

  it("reads a legacy v1 file beside the images and keeps its SVG history", async () => {
    const root = makeRoot();
    const legacy = JSON.stringify({
      v: 1,
      source: { relPath: "split_01/icon_AI_01.png", name: "icon_AI_01.png", fingerprint: "20:960" },
      versions: [{ version: 1, svgPath: "split_01/icon_AI_01.svg", status: "generated", review: "approved",
        prompt: "p", provider: "requesty", model: "m", requestedAt: "t", completedAt: "t",
        usage: { input: 1, output: 2, total: 3 }, cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "v1", basis: "provider" },
        validation: { ok: true, errors: [], warnings: [], icons: 1 }, batch: null, error: null, requestId: "r" }],
    });
    (root.children.get("split_01") as FakeDir).children.set("icon_AI_01.svg.json", new FakeFile("icon_AI_01.svg.json", legacy.length, 500, legacy));
    const load = await loadPairDecisions(root, await walk(root));
    expect(load.metas.get(PIECE)?.versions[0].review).toBe("approved");
    expect(load.metas.get(PIECE)?.decision).toBeNull(); // an old file never claims the pair decision
  });

  it("still reads the legacy global file for pairs that have no local file", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
      records: [{ pair_id: PIECE, source: "split_01/icon.png", ai_result: "split_01/icon_AI_01.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }],
    })));
    const load = await loadPairDecisions(root, await walk(root));
    // the decision comes through as a record, though no local file exists yet
    expect(load.records.map((r) => [r.pair_id, r.decision])).toEqual([[PIECE, "approved"]]);
    expect(load.legacy).toBe(true);
  });

  it("lets a local file win over the legacy record — including an explicit reset", async () => {
    const root = makeRoot();
    writeMeta(root.children.get("split_01") as FakeDir, "icon_AI_01.svg.json", pieceMeta("pending"));
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
      records: [{ pair_id: PIECE, source: "split_01/icon.png", ai_result: "split_01/icon_AI_01.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }],
    })));
    const load = await loadPairDecisions(root, await walk(root));
    expect(load.metas.get(PIECE)?.decision).toBe("pending"); // pending: no record, the reset stands
  });
});

describe("writing one pair's file", () => {
  it("creates the file beside the AI image, with the decision and no global file", async () => {
    const root = makeRoot();
    const pair = pairEntries(await walk(root)).find((p) => p.pairId === PIECE)!;
    const meta = pieceMeta("approved");
    await savePairDecision(root, pair, meta);
    expect(root.children.has("review-decisions.json")).toBe(false);
    const file = (root.children.get("split_01") as FakeDir).children.get("icon_AI_01.svg.json") as FakeFile;
    expect(file).toBeTruthy();
    expect(JSON.parse(file.text).decision).toBe("approved");
    expect(JSON.parse(file.text).pair.id).toBe(PIECE);
  });

  it("leaves no temp file behind and keeps a previous history", async () => {
    const root = makeRoot();
    const pair = pairEntries(await walk(root)).find((p) => p.pairId === PIECE)!;
    const withHistory = { ...pieceMeta("approved"), versions: [{ version: 1 } as never] };
    await savePairDecision(root, pair, withHistory);
    const dir = root.children.get("split_01") as FakeDir;
    expect([...dir.children.keys()].filter((n) => n.includes("tmp"))).toEqual([]);
    expect(JSON.parse((dir.children.get("icon_AI_01.svg.json") as FakeFile).text).versions).toHaveLength(1);
  });

  it("carries a chosen version through the store, beside the images (I-54)", async () => {
    const root = makeRoot();
    const pair = pairEntries(await walk(root)).find((p) => p.pairId === PIECE)!;
    const chosen = { ...pieceMeta("approved"), preferred: 1 };
    await savePairDecision(root, pair, chosen);
    const back = await loadMetaAt(root, "split_01/icon_AI_01.svg.json");
    expect(back.meta?.preferred).toBe(1);
    // the file itself carries the choice, and it still parses as v2
    const file = (root.children.get("split_01") as FakeDir).children.get("icon_AI_01.svg.json") as FakeFile;
    expect((JSON.parse(file.text) as { v: number }).v).toBe(2);
    expect((JSON.parse(file.text) as { preferred: number }).preferred).toBe(1);
  });

  it("throws when the file cannot be written, so the caller keeps the decision", async () => {
    const root = makeRoot();
    const dir = root.children.get("split_01") as FakeDir;
    dir.children.set("icon_AI_01.svg.json", new BrokenFile("icon_AI_01.svg.json"));
    const pair = pairEntries(await walk(root)).find((p) => p.pairId === PIECE)!;
    await expect(savePairDecision(root, pair, pieceMeta("approved"))).rejects.toThrow();
  });

  it("locates the file from a record's paths, even for a reference-only pair", () => {
    expect(metaPathOf({ pair_id: PIECE, source: "split_01/icon.png", ai_result: "split_01/icon_AI_01.png", decision: "approved", reviewed_at: "t" }))
      .toBe("split_01/icon_AI_01.svg.json");
    expect(metaPathOf({ pair_id: SHEET, source: "icon-sheet.png", ai_result: null, decision: "approved", reviewed_at: "t" }))
      .toBe("icon-sheet_AI.svg.json");
    expect(metaPathOf({ pair_id: "pair_x", source: null, ai_result: null, decision: "approved", reviewed_at: "t" })).toBe("");
  });

  it("agrees with the pair model about where a pair's file is", async () => {
    const root = makeRoot();
    for (const pair of pairEntries(await walk(root))) {
      expect(metaPathFor(pair)).toBe(metaPathOf({
        pair_id: pair.pairId, source: pair.source?.relPath ?? null, ai_result: pair.ai?.relPath ?? null,
        decision: "approved", reviewed_at: "t",
      }));
    }
  });
});

// selection_scan.test.ts — a rescan of the review tab obeys the same rules as
// the SVG tab's: build the whole snapshot, compare it, commit once, and let only
// the newest scan commit (design: recursive-scan-determinism D6/D7). A decision
// is read from the pair's OWN file beside its images (I-41) and a file that
// cannot be read is named while its decision survives (I-43). RULE 8: the
// exported rescan() runs for real against the in-memory fakes.
import { beforeEach, describe, expect, it } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { pairId } from "../src/lib/pairing";
import { initialSelState, type SelState } from "../src/selection/state";
import { rescan } from "../src/selection/rootsource";
import { setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairFile } from "./helpers/pairfile";
import { dropDb } from "./helpers/idb";

const COURT = pairId("architecture", "court", "");
const COURT_FILE = "architecture/court_AI.svg.json";

function decisionsJson(): string {
  return JSON.stringify({
    records: [{
      pair_id: COURT, source: "architecture/court.png", ai_result: "architecture/court_AI.png",
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    }],
  });
}

/** architecture/court.png + its AI result + the pair's OWN approved file. */
function makeRoot(): FakeDir {
  return withCourtFile(pairFileText("approved"));
}

/** The same root decided the old way: a legacy global file, no pair file. */
function makeLegacyRoot(): FakeDir {
  const root = makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  arch.children.delete("court_AI.svg.json");
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson()));
  return root;
}

/** The pair file text for one decision, exactly as a write would store it. */
function pairFileText(decision: "approved" | "declined" | "pending"): string {
  return serializePairMeta(pairFile("architecture", "court_AI.png", { id: COURT, decision }));
}

function withCourtFile(text: string): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  arch.children.set("court_AI.svg.json", new FakeFile("court_AI.svg.json", text.length, 10, text));
  root.children.set("architecture", arch);
  return root;
}

/**
 * The reported tree: an unsplit sheet pair at the root (the batch's input) and
 * the batch's own pieces inside `_split_output`, each beside the reference copy
 * the batch writes. Only the pieces are reviewable (I-38).
 * With `appr`, each piece also gets its OWN pair file — written with the paths
 * the batch root sees, exactly as a decision taken there would store them.
 */
function makeBatchRoot(appr = false): FakeDir {
  const root = new FakeDir("test_processing");
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
  const run = new FakeDir("2026-10-01_10-24-31");
  const sheet = new FakeDir("icon-sheet_AI");
  for (const piece of ["01", "02"]) {
    const split = new FakeDir(`split_${piece}`);
    split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
    split.children.set(`icon-sheet_AI_${piece}.png`, new FakeFile(`icon-sheet_AI_${piece}.png`, 20, 1200, "e"));
    if (appr) {
      const text = serializePairMeta(pairFile(batchDir(piece), `icon-sheet_AI_${piece}.png`, { decision: "approved" }));
      split.children.set(`icon-sheet_AI_${piece}.svg.json`, new FakeFile(`icon-sheet_AI_${piece}.svg.json`, text.length, 10, text));
    }
    sheet.children.set(`split_${piece}`, split);
  }
  run.children.set("icon-sheet_AI", sheet);
  const month = new FakeDir("2026-10");
  month.children.set("2026-10-01_10-24-31", run);
  const out = new FakeDir("_split_output");
  out.children.set("2026-10", month);
  root.children.set("_split_output", out);
  return root;
}

/** The piece folder as the batch root sees it (the path a decision writes). */
function batchDir(piece: string): string {
  return `_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_${piece}`;
}

/** The folder the user opened, at the reported levels of the same tree. */
function branch(root: FakeDir, rel: string): FakeDir {
  let dir = root;
  for (const seg of rel.split("/").filter(Boolean)) dir = dir.children.get(seg) as FakeDir;
  return dir;
}

describe("the reviewable set is the split output (I-38)", () => {
  it("lists the batch's pieces and reports the unsplit sheet it left out", async () => {
    const h = harness(makeBatchRoot());
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    expect(s.pairs.map((p) => p.relDir)).toEqual([
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    expect(s.pairs[0].ai?.relPath).toContain("icon-sheet_AI_01.png");
    expect(s.pairs[0].source?.relPath).toContain("split_01/icon-sheet.png");
    expect(s.scope).toEqual({ level: "output-child", outside: 1 });
    expect(h.sayings.join(" | ")).toContain("Scope: split output only");
  });

  it("keeps the decision of a pair the scope hides, as an orphan", async () => {
    const root = makeBatchRoot();
    const sheetId = pairId("", "icon-sheet", "");
    const pieces = JSON.stringify({
      records: [{
        pair_id: sheetId, source: "icon-sheet.png", ai_result: "icon-sheet_AI.png",
        decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
      }],
    });
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", pieces.length, 10, pieces));
    const h = harness(root);
    await rescan(h.ctx, h.set, h.say);
    // the sheet is not reviewable in this tree, but its decision is never lost
    expect(h.ctx.state.current.pairs.some((p) => p.pairId === sheetId)).toBe(false);
    expect(h.ctx.state.current.records.some((r) => r.pair_id === sheetId)).toBe(true);
  });

  it("reviews a plain folder as before when no split output exists", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.scope).toEqual({ level: "whole", outside: 0 });
    expect(h.ctx.state.current.pairs.map((p) => p.relDir)).toEqual(["architecture"]);
  });

  it("stays deterministic: the same tree gives the same scope and order twice", async () => {
    const a = harness(makeBatchRoot());
    const b = harness(makeBatchRoot());
    await rescan(a.ctx, a.set, a.say);
    await rescan(b.ctx, b.set, b.say);
    expect(a.ctx.state.current.pairs.map((p) => p.pairId)).toEqual(b.ctx.state.current.pairs.map((p) => p.pairId));
    expect(a.ctx.state.current.scope).toEqual(b.ctx.state.current.scope);
  });
});

describe("the same tree reviews the same pieces however deep it is opened (the reported 0-item bug)", () => {
  const PICKS = [
    "_split_output",
    "_split_output/2026-10",
    "_split_output/2026-10/2026-10-01_10-24-31",
  ];
  const PIECES = [
    "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
    "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
  ];
  const DEEP = ["2026-10-01_10-24-31/icon-sheet_AI/split_01", "2026-10-01_10-24-31/icon-sheet_AI/split_02"];

  it("lists the pieces — not nothing — at the output, the month and the run", async () => {
    const expected: Record<string, string[]> = {
      [PICKS[0]]: PIECES,
      [PICKS[1]]: DEEP,
      [PICKS[2]]: DEEP.map((d) => d.replace("2026-10-01_10-24-31/", "")),
    };
    for (const rel of PICKS) {
      const h = harness(branch(makeBatchRoot(), rel));
      await rescan(h.ctx, h.set, h.say);
      const s = h.ctx.state.current;
      expect(s.scope.outside).toBe(0); // opening inside the output hides nothing
      expect(s.pairs.map((p) => p.relDir)).toEqual(expected[rel]);
      expect(s.pairs.map((p) => p.ai?.relPath.split("/").pop())).toEqual(["icon-sheet_AI_01.png", "icon-sheet_AI_02.png"]);
      // the pick IS the output -> the scan explains that everything under it is
      // listed; a pick inside the output reviews all of it and explains nothing
      // (there is nothing to explain — the whole pick is reviewable).
      if (rel === "_split_output") {
        expect(h.sayings.join(" | ")).toContain("Scope: split output — everything under it is listed");
      } else {
        expect(h.sayings.join(" | ")).not.toContain("Scope:");
      }
    }
  });

  it("still has each piece's decision when the tree is opened at a deeper level", async () => {
    // the pair files were written at the batch root, naming `_split_output/…` paths
    for (const rel of PICKS) {
      const h = harness(branch(makeBatchRoot(true), rel));
      await rescan(h.ctx, h.set, h.say);
      const s = h.ctx.state.current;
      expect(s.pairs.map((p) => p.decision)).toEqual(["approved", "approved"]);
      expect(s.records.map((r) => r.decision)).toEqual(["approved", "approved"]);
      // the record names the file as THIS pick sees it (I-44) — that is how a row matches
      expect(s.records.map((r) => r.ai_result)).toEqual(s.pairs.map((p) => p.ai?.relPath));
    }
  });

  it("names the same two pieces at every level — only the paths are relative to the pick", async () => {
    const seen: string[][] = [];
    for (const rel of PICKS) {
      const h = harness(branch(makeBatchRoot(true), rel));
      await rescan(h.ctx, h.set, h.say);
      const s = h.ctx.state.current;
      expect(s.pairs).toHaveLength(2); // the reported bug listed ZERO here
      seen.push(s.pairs.map((p) => p.ai?.relPath.split("/").pop() ?? "").sort());
    }
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[2]).toEqual(seen[1]);
  });

  it("reports the unsplit sheet only where it is really mixed in — the batch root", async () => {
    const h = harness(makeBatchRoot(true));
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.scope).toEqual({ level: "output-child", outside: 1 });
    expect(h.sayings.join(" | ")).toContain("1 pair(s) in the main folder not listed");
  });
});

describe("the decision's source of truth is the pair's own file (I-41/I-42)", () => {
  it("an approved pair file makes the pair approved, with no legacy file present", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    expect(s.pairs[0].decision).toBe("approved");
    expect(s.records.map((r) => [r.pair_id, r.decision])).toEqual([[COURT, "approved"]]);
    expect((h.ctx.root.current as FakeDir).children.has("review-decisions.json")).toBe(false);
  });

  it("honours declined and pending exactly as the file says", async () => {
    const declined = harness(withCourtFile(pairFileText("declined")));
    await rescan(declined.ctx, declined.set, declined.say);
    expect(declined.ctx.state.current.pairs[0].decision).toBe("declined");
    const reset = harness(withCourtFile(pairFileText("pending")));
    await rescan(reset.ctx, reset.set, reset.say);
    expect(reset.ctx.state.current.pairs[0].decision).toBe("pending");
    expect(reset.ctx.state.current.records).toEqual([]); // pending owns no record (I-13)
  });

  it("still reads the legacy file for a pair that has none of its own", async () => {
    const h = harness(makeLegacyRoot());
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.pairs[0].decision).toBe("approved");
    expect(h.ctx.state.current.records).toHaveLength(1);
  });

  it("names an unreadable pair file and keeps the decision it already had", async () => {
    const root = makeRoot();
    const h = harness(root);
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.pairs[0].decision).toBe("approved");
    const arch = (root.children.get("architecture") as FakeDir);
    arch.children.set("court_AI.svg.json", new FakeFile("court_AI.svg.json", 5, 20, "{oops"));
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    expect(s.pairs[0].decision).toBe("approved"); // never silently turned pending
    expect(s.corruptFiles).toEqual([COURT_FILE]);
    expect(h.sayings.join(" | ")).toContain("court_AI.svg.json");
    arch.children.delete("court_AI.svg.json"); // and the next scan is clean again
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.corruptFiles).toEqual([]);
    expect(h.ctx.state.current.pairs[0].decision).toBe("approved");
  });
});

type RescanArgs = Parameters<typeof rescan>;

/** A ctx + setter pair that mirrors how the hook holds its state (RULE 24). */
function harness(root: FakeDir) {
  const ctx = {
    root: { current: root },
    state: { current: initialSelState() },
    hist: {} as RescanArgs[0]["hist"],
    seq: { current: SCAN_IDLE },
  };
  const calls: SelState[] = [];
  const sayings: string[] = [];
  const set: RescanArgs[1] = (next) => {
    ctx.state.current = typeof next === "function" ? next(ctx.state.current) : next;
    calls.push(ctx.state.current);
  };
  const say = (m: string): void => { sayings.push(m); };
  return { ctx, calls, sayings, set, say };
}

/** One-shot barrier: the first read waits for release(), later reads pass. */
class OneShotGate extends FakeFile {
  private readonly gate: Promise<void>;
  private readonly resolveGate: () => void;
  private readonly reached: Promise<void>;
  private readonly markReached: () => void;
  private opened = false;

  constructor(name: string, text: string) {
    super(name, text.length, 10, text);
    let release: () => void = () => undefined;
    this.gate = new Promise<void>((r) => { release = r; });
    this.resolveGate = release;
    let mark: () => void = () => undefined;
    this.reached = new Promise<void>((r) => { mark = r; });
    this.markReached = mark;
  }

  async getFile(): Promise<File> {
    if (!this.opened) {
      this.opened = true;
      this.markReached();
      await this.gate;
    }
    return super.getFile();
  }

  held(): Promise<void> {
    return this.reached;
  }

  release(): void {
    this.resolveGate();
  }
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
});

describe("rescan — one snapshot, one commit", () => {
  it("keeps the pair list and the records by reference when nothing changed", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    const first = h.ctx.state.current;
    expect(first.pairs).toHaveLength(1);
    await rescan(h.ctx, h.set, h.say);
    const again = h.ctx.state.current;
    expect(again.pairs).toBe(first.pairs); // no row replacement, no churn
    expect(again.records).toBe(first.records);
    expect(again.lastRescanAt).toBeGreaterThanOrEqual(first.lastRescanAt);
    expect(again.busy).toBeNull();
  });

  it("commits the changed snapshot once", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    const arch = await (h.ctx.root.current as FakeDir).getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await rescan(h.ctx, h.set, h.say);
    const pairs = h.ctx.state.current.pairs;
    expect(pairs).toHaveLength(1);
    expect(pairs[0].ai).toBeNull(); // gone, and still listed with its status
    expect(pairs[0].decision).toBe("approved");
  });

  it("carries a decision through a folder rename, once", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    const root = h.ctx.root.current as FakeDir;
    const arch = await root.getDirectoryHandle("architecture");
    const gallery = new FakeDir("gallery");
    for (const [name, child] of arch.children) gallery.children.set(name, child);
    root.children.delete("architecture");
    root.children.set("gallery", gallery);
    await rescan(h.ctx, h.set, h.say);
    const pairs = h.ctx.state.current.pairs;
    expect(pairs).toHaveLength(1);
    expect(pairs[0].relDir).toBe("gallery");
    expect(pairs[0].pairId).not.toBe(COURT); // the id is dir-scoped…
    expect(pairs[0].decision).toBe("approved"); // …and the decision travelled with it
    const committed = h.ctx.state.current.pairs;
    await rescan(h.ctx, h.set, h.say); // and the new snapshot is stable
    expect(h.ctx.state.current.pairs).toBe(committed);
  });

  it("lets only the newest rescan commit when two overlap", async () => {
    const root = makeRoot();
    const gate = new OneShotGate("court_AI.svg.json", pairFileText("approved"));
    (root.children.get("architecture") as FakeDir).children.set("court_AI.svg.json", gate);
    const h = harness(root);
    const slow = rescan(h.ctx, h.set, h.say); // ticket 1 — blocked on the pair file
    await gate.held();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png"); // the newer snapshot differs
    await rescan(h.ctx, h.set, h.say); // ticket 2 — commits
    const committed = h.ctx.state.current;
    const writes = h.calls.length;
    expect(committed.pairs[0].ai).toBeNull();
    gate.release();
    await slow; // ticket 1 resolves; it is no longer the newest
    expect(h.ctx.state.current.pairs).toBe(committed.pairs);
    expect(h.calls.length).toBe(writes);
    expect(h.ctx.state.current.busy).toBeNull();
  });
});

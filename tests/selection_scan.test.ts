// selection_scan.test.ts — a rescan of the review tab obeys the same rules as
// the SVG tab's: build the whole snapshot, compare it, commit once, and let only
// the newest scan commit (design: recursive-scan-determinism D6/D7). A decision
// is read from the pair's OWN file beside its images (I-41) and a file that
// cannot be read is named while its decision survives (I-43). RULE 8: the
// exported rescan() runs for real against the in-memory fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { pairId } from "../src/lib/pairing";
import { initialSelState, type SelState } from "../src/selection/state";
import { boot, rescan } from "../src/selection/rootsource";
import { setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairFile } from "./helpers/pairfile";
import { dropDb } from "./helpers/idb";
import { SELECTION_HANDLE_KEY } from "../src/selection/offline";
import { saveHandles } from "../src/batch/store";
import { loadRootPath, saveRootPathInfo } from "../src/lib/rootpath";
import { clearKnownRoots, deriveRootPath } from "../src/ui/knownroots";

// No IndexedDB in this DOM: an in-memory handle store keeps boot real (and the
// handle it restores is the very object the test picked, as in the browser).
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

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
 */
function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
  const run = new FakeDir("2026-10-01_10-24-31");
  const sheet = new FakeDir("icon-sheet_AI");
  for (const piece of ["01", "02"]) {
    const split = new FakeDir(`split_${piece}`);
    split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
    split.children.set(`icon-sheet_AI_${piece}.png`, new FakeFile(`icon-sheet_AI_${piece}.png`, 20, 1200, "e"));
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

/** The batch's output folder itself — what a human browses and picks. */
function batchOut(): FakeDir {
  return makeBatchRoot().children.get("_split_output") as FakeDir;
}

/** One run folder inside it: `…/_split_output/2026-10/2026-10-01_10-24-31`. */
function batchRun(): FakeDir {
  const month = batchOut().children.get("2026-10") as FakeDir;
  return month.children.get("2026-10-01_10-24-31") as FakeDir;
}

describe("the reviewable set is the split output (I-38/I-47)", () => {
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
    expect(s.scope).toEqual({ split: true, outside: 1 });
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

  it("reviews the pieces when the picked folder IS the output folder (I-47)", async () => {
    const h = harness(batchOut());
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    // the reported pick: F:\\…\\test_processing_2\\_split_output — everything
    // below it is the batch's output, so every piece is reviewable
    expect(s.pairs.map((p) => p.relDir)).toEqual([
      "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    expect(s.scope).toEqual({ split: true, outside: 0 }); // nothing is "in the main folder"
    expect(h.sayings.join(" | ")).toContain("Scope: split output only");
    expect(h.sayings.join(" | ")).not.toContain("not listed");
  });

  it("reviews the pieces when the picked folder is one run folder (I-47)", async () => {
    const h = harness(batchRun());
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    expect(s.pairs).toHaveLength(2);
    expect(s.scope).toEqual({ split: true, outside: 0 });
  });

  it("shows the approval made under the main root when scanned from the output root (I-49)", async () => {
    const main = makeBatchRoot();
    // the piece was approved while `test_processing` was the root (its own file)
    const dirPath = "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01";
    const text = serializePairMeta(pairFile(dirPath, "icon-sheet_AI_01.png", { decision: "approved" }));
    const split = ((main.children.get("_split_output") as FakeDir).children.get("2026-10") as FakeDir)
      .children.get("2026-10-01_10-24-31") as FakeDir;
    const sheet = (split.children.get("icon-sheet_AI") as FakeDir).children.get("split_01") as FakeDir;
    sheet.children.set("icon-sheet_AI_01.svg.json", new FakeFile("icon-sheet_AI_01.svg.json", text.length, 10, text));
    const out = main.children.get("_split_output") as FakeDir;
    const h = harness(out);
    await rescan(h.ctx, h.set, h.say);
    const s = h.ctx.state.current;
    expect(s.pairs).toHaveLength(2);
    const piece = s.pairs.find((p) => p.relDir.endsWith("split_01"));
    expect(piece?.pairId).toBe(pairId("2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01", "icon-sheet", "_01"));
    expect(s.records.find((r) => r.pair_id === piece?.pairId)?.decision).toBe("approved");
  });

  it("reviews a plain folder as before when no split output exists", async () => {
    const h = harness(makeRoot());
    await rescan(h.ctx, h.set, h.say);
    expect(h.ctx.state.current.scope).toEqual({ split: false, outside: 0 });
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
  localStorage.clear(); // the path memory is one storage key; a test must not inherit it
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

describe("Rescan captures a path the pick missed (I-52)", () => {
  it("saves the exact path from the clipboard and says the one line", async () => {
    const root = makeRoot(); // named split_root, no path captured yet
    const h = harness(root);
    stubClipboard(async () => "F:\\work\\split_root");
    await rescan(h.ctx, h.set, h.say);
    expect(loadRootPath(root.name)).toBe("F:\\work\\split_root");
    expect(h.sayings.join(" | ")).toContain("Folder path captured: F:\\work\\split_root");
    // a second rescan has nothing to capture and stays quiet about it
    h.sayings.length = 0;
    await rescan(h.ctx, h.set, h.say);
    expect(h.sayings.join(" | ")).not.toContain("Folder path captured");
  });

  it("never invents a path from a clipboard that does not name this folder", async () => {
    const root = makeRoot();
    const h = harness(root);
    stubClipboard(async () => "F:\\work\\icons testing");
    await rescan(h.ctx, h.set, h.say);
    expect(loadRootPath(root.name)).toBe("");
  });
});

describe("the restored folder is remembered at boot (I-51)", () => {
  it("names a pick inside it exactly, with no clipboard involved", async () => {
    const root = makeBatchRoot();
    saveRootPathInfo(root.name, "F:\\work\\test_processing");
    await saveHandles(SELECTION_HANDLE_KEY, { source: root });
    const h = harness(root);
    await boot(h.ctx, h.set);
    const out = root.children.get("_split_output") as FakeDir;
    // the folder the app already has a path for answers where the next pick lives
    expect(await deriveRootPath(out)).toEqual({ kind: "derived", path: "F:\\work\\test_processing\\_split_output" });
    clearKnownRoots();
  });
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

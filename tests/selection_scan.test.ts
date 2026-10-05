// selection_scan.test.ts — a rescan of the review tab obeys the same rules as
// the SVG tab's: build the whole snapshot, compare it, commit once, and let only
// the newest scan commit (design: recursive-scan-determinism D6/D7). RULE 8:
// the exported rescan() runs for real against the in-memory fakes.
import { beforeEach, describe, expect, it } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { pairId } from "../src/lib/pairing";
import { initialSelState, type SelState } from "../src/selection/state";
import { rescan } from "../src/selection/useSelection";
import { setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

const COURT = pairId("architecture", "court", "");

function decisionsJson(): string {
  return JSON.stringify({
    records: [{
      pair_id: COURT, source: "architecture/court.png", ai_result: "architecture/court_AI.png",
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    }],
  });
}

/** architecture/court.png + a readable AI result, plus an unreadable sibling. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson()));
  return root;
}

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
    const gate = new OneShotGate("review-decisions.json", decisionsJson());
    root.children.set("review-decisions.json", gate);
    const h = harness(root);
    const slow = rescan(h.ctx, h.set, h.say); // ticket 1 — blocked on the decision file
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

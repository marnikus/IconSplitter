// svg_scan.test.ts — the scan orchestrator: one snapshot, one commit
// (design: recursive-scan-determinism D6/D7). RULE 8: the real scanSources runs
// against the in-memory File System Access fakes, so the sequencing, the
// build-then-commit order and the "nothing changed" path all execute for real.
import { beforeEach, describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { beginScan, isCurrent, SCAN_IDLE } from "../src/lib/scanseq";
import { scanKey } from "../src/svg/scankey";
import { scanSources } from "../src/svg/scan";
import { setAppState } from "../src/state/appstore";
import type { Discovery } from "../src/svg/sources";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

/** architecture/{fog,court} with both pairs approved. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson()));
  return root;
}

function decisionsJson(): string {
  const records = [FOG, COURT].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  return JSON.stringify({ records });
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

function refs(root: FakeDir): SvgRefs {
  return {
    root: { current: root }, sidecars: new Map(), abort: { current: null }, key: { current: null },
    scanKey: { current: null }, seq: { current: SCAN_IDLE },
  };
}

function setters() {
  const out = { rows: [] as SvgRow[], rowCalls: 0, discovery: null as Discovery | null, busy: null as string | null, tokens: 0, said: [] as string[] };
  const api = {
    setRootName: () => undefined,
    setRows: (rows: SvgRow[]) => { out.rows = rows; out.rowCalls += 1; },
    setDiscovery: (d: Discovery | null) => { out.discovery = d; },
    setBusy: (b: string | null) => { out.busy = b; },
    setRootToken: () => { out.tokens += 1; },
    say: (m: string) => { out.said.push(m); },
  };
  return { out, api };
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
});

describe("scan sequencing (D6)", () => {
  it("makes the newest ticket the only one allowed to commit", () => {
    const first = beginScan(SCAN_IDLE);
    const second = beginScan(first.seq);
    expect(second.id).toBeGreaterThan(first.id);
    expect(isCurrent(second.seq, second.id)).toBe(true);
    expect(isCurrent(second.seq, first.id)).toBe(false);
  });
});

describe("scanSources — one complete snapshot per commit", () => {
  it("commits rows, discovery and the root token exactly once", async () => {
    const r = refs(makeRoot());
    const s = setters();
    await scanSources(r, s.api);
    expect(s.out.rowCalls).toBe(1);
    expect(s.out.rows.map((row) => row.source.id)).toEqual([COURT, FOG]);
    expect(s.out.discovery?.sources).toHaveLength(2);
    expect(s.out.tokens).toBe(1);
    expect(s.out.busy).toBeNull();
    expect(s.out.said).toEqual([]);
    expect(r.scanKey.current).not.toBeNull();
  });

  it("rebuilds identical rows on a fresh boot — a reload is not a change", async () => {
    const root = makeRoot();
    const first = setters();
    await scanSources(refs(root), first.api);
    const second = setters();
    await scanSources(refs(root), second.api); // a new panel, same folder
    expect(JSON.stringify(second.out.rows)).toBe(JSON.stringify(first.out.rows));
    expect(JSON.stringify(second.out.discovery)).toBe(JSON.stringify(first.out.discovery));
    expect(second.out.tokens).toBe(1);
  });

  it("commits nothing when the folder did not change", async () => {
    const r = refs(makeRoot());
    const s = setters();
    await scanSources(r, s.api);
    const key = r.scanKey.current;
    await scanSources(r, s.api);
    expect(s.out.rowCalls).toBe(1);
    expect(s.out.tokens).toBe(1);
    expect(s.out.busy).toBeNull();
    expect(r.scanKey.current).toBe(key);
  });

  it("commits the changed snapshot once, with the reason on the row", async () => {
    const r = refs(makeRoot());
    const s = setters();
    await scanSources(r, s.api);
    const arch = await (r.root.current as FakeDir).getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await scanSources(r, s.api);
    expect(s.out.rowCalls).toBe(2);
    expect(s.out.tokens).toBe(2);
    expect(s.out.rows[0].source.problems.map((p) => p.kind)).toEqual(["ai-missing"]);
    expect(s.out.rows[0].sidecar).toBeNull();
  });

  it("lets only the newest scan commit when two overlap", async () => {
    const root = makeRoot();
    const gate = new OneShotGate("review-decisions.json", decisionsJson());
    root.children.set("review-decisions.json", gate);
    const r = refs(root);
    const s = setters();
    const slow = scanSources(r, s.api); // ticket 1 — blocked on the decision file
    await gate.held();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png"); // the newer snapshot differs
    await scanSources(r, s.api); // ticket 2 — commits
    expect(s.out.rowCalls).toBe(1);
    expect(s.out.tokens).toBe(1);
    gate.release();
    await slow; // ticket 1 resolves; it is no longer the newest
    expect(s.out.rowCalls).toBe(1);
    expect(s.out.tokens).toBe(1);
    expect(s.out.rows[0].source.problems.map((p) => p.kind)).toEqual(["ai-missing"]);
  });
});

describe("scanKey — what a commit would change (D7)", () => {
  it("is equal for the same rows and differs when a row changes", () => {
    const r = refs(makeRoot());
    const s = setters();
    return scanSources(r, s.api).then(() => {
      const rows = s.out.rows;
      const discovery = s.out.discovery!;
      const key = scanKey("split_root", discovery, rows);
      expect(scanKey("split_root", discovery, rows)).toBe(key);
      expect(scanKey("other_root", discovery, rows)).not.toBe(key);
      const broken = [{ ...rows[0], status: "failed" as const }, rows[1]];
      expect(scanKey("split_root", discovery, broken)).not.toBe(key);
      const versioned = [{ ...rows[0], newest: { version: 1, svgPath: "x.svg", status: "generated" as const, review: "pending" as const } as SvgRow["newest"] }, rows[1]];
      expect(scanKey("split_root", discovery, versioned)).not.toBe(key);
    });
  });
});

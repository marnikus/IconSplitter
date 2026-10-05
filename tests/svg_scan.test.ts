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
import { serializePairMeta } from "../src/lib/pairmeta";
import { withPreferred } from "../src/lib/pairpreferred";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

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
    root: { current: root }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null },
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

/**
 * `2026-10/<run>/icon-sheet_AI/split_0N/` with both pieces approved. `prefix` is
 * the folder's own path from the root that will be picked, so the same tree can
 * be used as the root itself ("" ) or below it (`"_split_output/"`).
 */
function makeOutputRoot(prefix = ""): FakeDir {
  const out = new FakeDir("_split_output");
  const month = new FakeDir("2026-10");
  const run = new FakeDir("2026-10-05_18-45-20");
  const ai = new FakeDir("icon-sheet_AI");
  for (const piece of ["01", "02"]) {
    const split = new FakeDir(`split_${piece}`);
    const aiName = `icon-sheet_AI_${piece}.png`;
    split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
    split.children.set(aiName, new FakeFile(aiName, 20, 1200, "e"));
    const dirPath = `${prefix}2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_${piece}`;
    const text = serializePairMeta(pairFile(dirPath, aiName, { decision: "approved" }));
    split.children.set("icon-sheet_AI_" + piece + ".svg.json", new FakeFile(`icon-sheet_AI_${piece}.svg.json`, text.length, 10, text));
    ai.children.set(`split_${piece}`, split);
  }
  run.children.set("icon-sheet_AI", ai);
  month.children.set("2026-10-05_18-45-20", run);
  out.children.set("2026-10", month);
  return out;
}

describe("an approval outlives the root it was made under (I-49)", () => {
  /** The main folder: the unsplit sheet pair + the batch's output below it. */
  function mainTree(): FakeDir {
    const root = new FakeDir("test_processing_2");
    root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
    root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
    const sheet = serializePairMeta(pairFile("", "icon-sheet_AI.png", { decision: "approved" }));
    root.children.set("icon-sheet_AI.svg.json", new FakeFile("icon-sheet_AI.svg.json", sheet.length, 10, sheet));
    root.children.set("_split_output", makeOutputRoot("_split_output/"));
    return root;
  }

  it("lists the pieces from the output root when the approval was made from the main root", async () => {
    const main = mainTree();
    const out = main.children.get("_split_output") as FakeDir;
    const s = setters();
    await scanSources(refs(out), s.api);
    const discovery = s.out.discovery as Discovery;
    expect(discovery.sources.map((x) => x.relPath)).toEqual([
      "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01/icon-sheet_AI_01.png",
      "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_02/icon-sheet_AI_02.png",
    ]);
    // no "missing files" and no ai-missing exclusions for pairs whose images are there
    expect(discovery.excluded).toEqual([]);
    expect(discovery.audit.missing).toBe(0);
  });

  it("lists the same pairs from the month root and from the run root", async () => {
    const main = mainTree();
    const out = main.children.get("_split_output") as FakeDir;
    const month = out.children.get("2026-10") as FakeDir;
    const monthScan = setters();
    await scanSources(refs(month), monthScan.api);
    expect((monthScan.out.discovery as Discovery).audit.missing).toBe(0);
    expect((monthScan.out.discovery as Discovery).sources).toHaveLength(2);
  });
});

describe("the picked output folder is the approved set (I-47)", () => {
  it("lists the approved pieces instead of excluding them as outside-split", async () => {
    const s = setters();
    await scanSources(refs(makeOutputRoot()), s.api);
    const discovery = s.out.discovery as Discovery;
    // the reported pick: the app's own `_split_output` folder as the root
    expect(discovery.sources.map((x) => x.relPath)).toEqual([
      "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01/icon-sheet_AI_01.png",
      "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_02/icon-sheet_AI_02.png",
    ]);
    expect(discovery.excluded).toEqual([]); // no "outside the split output" rows
    expect(s.out.rows).toHaveLength(2);
  });

  it("still excludes the unsplit sheets when the output folder is BELOW the root", async () => {
    const root = new FakeDir("test_processing_2");
    root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
    root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
    // the sheet is approved too — so hiding it must be REPORTED, never silent
    const sheet = serializePairMeta(pairFile("", "icon-sheet_AI.png", { decision: "approved" }));
    root.children.set("icon-sheet_AI.svg.json", new FakeFile("icon-sheet_AI.svg.json", sheet.length, 10, sheet));
    root.children.set("_split_output", makeOutputRoot("_split_output/"));
    const s = setters();
    await scanSources(refs(root), s.api);
    const discovery = s.out.discovery as Discovery;
    expect(discovery.sources.map((x) => x.relPath)).toEqual([
      "_split_output/2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01/icon-sheet_AI_01.png",
      "_split_output/2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_02/icon-sheet_AI_02.png",
    ]);
    expect(discovery.excluded.map((e) => e.kind)).toEqual(["outside-split"]); // the sheet, named
  });
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

  it("commits the changed snapshot once, dropping the row whose AI image went away", async () => {
    const r = refs(makeRoot());
    const s = setters();
    await scanSources(r, s.api);
    expect(s.out.rows).toHaveLength(2);
    const arch = await (r.root.current as FakeDir).getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await scanSources(r, s.api);
    expect(s.out.rowCalls).toBe(2);
    expect(s.out.tokens).toBe(2);
    // the reference must never be listed as something to generate from …
    expect(s.out.rows.map((row) => row.source.name)).toEqual(["fog_AI.png"]);
    // … and the scan says why it is gone, instead of hiding the fact
    const discovery = s.out.discovery as { excluded: { kind: string; reason: string }[] };
    expect(discovery.excluded.map((e) => e.kind)).toEqual(["ai-missing"]);
    expect(discovery.excluded[0].reason).toContain("no AI result (court_AI.png) beside architecture/court.png");
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
    expect(s.out.rows.map((row) => row.source.name)).toEqual(["fog_AI.png"]);
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
      // A row that gained a version shows something else: a new key.
      const meta = pairFile("architecture", "fog_AI.png", {
        versions: [svgVersion("architecture/fog_AI_v1.svg", { version: 1 }), svgVersion("architecture/fog_AI_v2.svg", { version: 2 })],
        preferred: 2,
      });
      const versioned = [{ ...rows[0], meta }, rows[1]];
      const versionedKey = scanKey("split_root", discovery, versioned);
      expect(versionedKey).not.toBe(key);
      // ...and so does the USER'S CHOICE among the versions it already has
      // (I-54): the preference is what the panel shows, not a side note.
      const chosen = [{ ...rows[0], meta: withPreferred(meta, 1) }, rows[1]];
      expect(scanKey("split_root", discovery, chosen)).not.toBe(versionedKey);
    });
  });
});

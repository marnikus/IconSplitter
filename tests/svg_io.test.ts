// svg_io.test.ts — the SVG tab's IO layer executes for real (RULE 8): scanning
// the picked root for approved pairs, the row model, the runner-event mapping,
// the review decision + its undo path, the state reducer, the root token and
// the write order that makes a bad result harmless. Each test fails if the
// module it covers is deleted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { newSidecar, newestValid, parseSidecar, serializeSidecar, withVersion } from "../src/lib/svgfile";
import { saveSvgVersion, recordFailure } from "../src/svg/saveversion";
import { loadSidecar, readSvgText, listSvgFiles, saveSidecar } from "../src/svg/sidecar";
import { discoverApprovedSources, toBatchSource } from "../src/svg/sources";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { bootSources, rememberRoot, scanSources } from "../src/svg/scan";
import { headerState, pruneChecked, toListRow, toRow, visibleRows } from "../src/svg/rowmodel";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "../src/svg/runstate";
import { applyReviewPatch, decideReview } from "../src/svg/reviewact";
import { initialModel, reduceState } from "../src/svg/statemodel";
import { DEFAULT_SVG_PREFS, SVG_PREFS_KEY, loadSvgPrefs, parseSvgPrefs, saveSvgPrefs } from "../src/svg/prefsstore";
import { DEFAULT_PREVIEW_BACKGROUND } from "../src/lib/svgbackground";
import type { SvgRow } from "../src/svg/types";
import { getAppState, patchSvg, setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile, LockedFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

// No IndexedDB in this DOM: an in-memory handle store keeps boot/remember real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

/** architecture/{fog,court} + coastal/harbor with approved decisions. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  root.children.set("architecture", arch);
  root.children.set("coastal", coast);
  return root;
}

/** The same logical root, with every directory enumerated in the opposite order. */
function mirrored(root: FakeDir): FakeDir {
  const out = new FakeDir(root.name);
  for (const [name, child] of [...root.children.entries()].reverse()) {
    out.children.set(name, child instanceof FakeDir ? mirrored(child) : child);
  }
  return out;
}

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

function decisionsJson(...approved: string[]): string {
  const recs = [FOG, COURT, pairId("coastal", "harbor", "")].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: approved.includes(id) ? "approved" : "pending", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  return JSON.stringify({ records: recs });
}

/** Minimal setters object that records what a scan wrote. */
function setters() {
  const out = { name: "", rows: [] as unknown[], discovery: null as unknown, busy: null as unknown, said: [] as string[], tokens: 0 };
  return {
    out,
    api: {
      setRootName: (n: string) => { out.name = n; },
      setRows: (r: unknown[]) => { out.rows = r; },
      setDiscovery: (d: unknown) => { out.discovery = d; },
      setBusy: (b: unknown) => { out.busy = b; },
      setRootToken: () => { out.tokens += 1; },
      say: (m: string) => { out.said.push(m); },
    },
  };
}

function refs(root: FakeDir | null = null) {
  return {
    root: { current: root }, sidecars: new Map(), abort: { current: null }, key: { current: null },
    scanKey: { current: null }, seq: { current: SCAN_IDLE }, run: { current: null },
  };
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
});

describe("approved-source discovery", () => {
  it("lists every approved pair, in path order, with no problems when healthy", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.sources[0].name).toBe("court_AI.png");
    expect(found.sources[0].stem).toBe("court_AI");
    expect(found.sources[0].dirPath).toBe("architecture");
    expect(found.sources.every((s) => s.problems.length === 0)).toBe(true);
    expect(found.problems).toEqual([]);
    expect(found.unreadable).toEqual([]);
    expect(found.corruptDecisions).toBe(false);
  });

  it("says the decision file is corrupt instead of dropping every source", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, "{not json"));
    const found = await discoverApprovedSources(root);
    expect(found.corruptDecisions).toBe(true);
    expect(found.sources).toEqual([]);
  });

  it("keeps an approved pair whose AI image disappeared, with the reason on it", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    const court = found.sources[0];
    expect(court.relPath).toBe("architecture/court_AI.png");
    expect(court.stem).toBe("court_AI");
    expect(court.problems).toEqual([
      { kind: "ai-missing", relPath: null, reason: "no AI result (court_AI.png) beside architecture/court.png" },
    ]);
    expect(found.problems).toEqual([{ id: COURT, ...court.problems[0] }]);
    expect(found.unreadable).toEqual([]);
  });

  it("answers byte-identically whatever order the filesystem enumerated", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const first = await discoverApprovedSources(root);
    const again = await discoverApprovedSources(root);
    const flipped = await discoverApprovedSources(mirrored(root));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    expect(JSON.stringify(flipped)).toBe(JSON.stringify(first));
  });

  it("writes nothing into the scanned root", async () => {
    const root = makeRoot();
    const before = [...root.children.keys()];
    const arch = await root.getDirectoryHandle("architecture");
    await discoverApprovedSources(root);
    expect([...root.children.keys()]).toEqual(before);
    expect([...arch.children.keys()]).toEqual(["fog.png", "fog_AI.png", "court.png", "court_AI.png"]);
  });

  it("reports an unreadable file with its path and never as a vanished pair", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const arch = await root.getDirectoryHandle("architecture");
    arch.children.set("court_AI.png", new LockedFile("court_AI.png"));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.sources[0].problems).toEqual([
      { kind: "unreadable", relPath: "architecture/court_AI.png", reason: "architecture/court_AI.png could not be read (locked or still being written)" },
    ]);
    expect(found.unreadable).toEqual([
      { relPath: "architecture/court_AI.png", reason: "architecture/court_AI.png could not be read (locked or still being written)" },
    ]);
  });

  it("keeps an approved pair whose every file is gone, as a status row", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await arch.removeEntry("court.png");
    const rec = {
      pair_id: COURT, source: "architecture/court.png", ai_result: "architecture/court_AI.png",
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    };
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: [rec] })));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT]);
    expect(found.sources[0].relPath).toBe("architecture/court_AI.png");
    expect(found.sources[0].problems).toEqual([
      { kind: "files-missing", relPath: null, reason: "only the decision record remains for architecture/court_AI.png" },
    ]);
  });

  it("ignores this app's own version artifacts instead of inventing a row", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", 30, 3200, "<svg/>"));
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.problems).toEqual([]);
  });

  it("maps a source onto its batch identity without touching the file id", () => {
    const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" , problems: []};
    expect(toBatchSource(source)).toEqual({ sourceId: FOG, name: "fog_AI", relPath: "architecture/fog_AI.png", fingerprint: "20:3100" });
  });
});

describe("scanSources", () => {
  it("loads every sidecar and reports what could not be used", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const r = refs(root);
    const s = setters();
    await scanSources(r, s.api);
    expect(s.out.rows).toHaveLength(2);
    expect(s.out.busy).toBeNull();
    // one bumped token per scan: a row's preview re-reads the file it shows
    expect(s.out.tokens).toBe(1);
    const rows = s.out.rows as { source: { id: string }; sidecar: unknown }[];
    expect(rows.every((row) => row.sidecar === null)).toBe(true);
    expect(r.sidecars.size).toBe(2);
  });

  it("keeps the previous rows and says so when the scan throws", async () => {
    const broken = {
      kind: "directory", name: "broken",
      getDirectoryHandle: () => { throw new Error("gone"); },
      getFileHandle: () => { throw new Error("gone"); },
      entries: () => { throw new Error("gone"); },
    } as unknown as FakeDir;
    const s = setters();
    await scanSources(refs(broken), s.api);
    expect(s.out.said.join(" ")).toContain("Rescan failed");
    expect(s.out.rows).toEqual([]);
  });

  it("remembers and restores the picked folder", async () => {
    const root = makeRoot();
    await rememberRoot(root);
    const r = refs();
    const s = setters();
    await bootSources(r, { setRootName: (n) => { s.out.name = n; }, loadAll: () => {}, refreshKey: () => {} });
    expect(s.out.name).toBe("split_root");
    expect(r.root.current).toBe(root);
  });
});

describe("row model", () => {
  const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" , problems: []};
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

  it("marks a source with no sidecar as not generated", () => {
    const row = toRow(source, null, false);
    expect(row.status).toBe("not-generated");
    expect(row.newest).toBeNull();
    expect(row.approved).toBeNull();
    expect(toListRow(row)).toMatchObject({ generation: "not-generated", review: "pending", version: 0, tokens: null, cost: null });
  });

  it("previews the newest VALID version and flags a corrupt sidecar", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    const dir = arch as unknown as FakeDir;
    const first = await saveSvgVersion({
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
      requestedAt: "2026-10-01T10:00:00.000Z",
      usage: { input: 100, output: 200, total: 300, cost: 0.01, currency: "USD" },
      batch: null, requestId: null, sidecar: null,
    });
    expect(first.ok).toBe(true);
    if (first.ok) await saveSidecar(root, source, first.sidecar);
    const loaded = await loadSidecar(root, source);
    const row = toRow(source, loaded.sidecar, loaded.corrupt);
    expect(row.status).toBe("generated");
    expect(row.newest?.version).toBe(1);
    expect(newestValid(loaded.sidecar)?.version).toBe(1);
    expect(toListRow(row).tokens).toBe(300);
    expect(toListRow(row).cost).toBe(0.01);
    expect(await readSvgText(root, first.ok ? first.svgPath : "")).toBe(svg);
    expect(await listSvgFiles(root, source)).toEqual(["fog_AI.svg"]);
    expect(dir.children.has("fog_AI.svg")).toBe(true);
  });

  it("never overwrites: the next save is version 2", async () => {
    const root = makeRoot();
    const args = {
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, sidecar: null,
    };
    const a = await saveSvgVersion(args);
    const b = await saveSvgVersion(args);
    expect(a.ok && b.ok && a.version).toBe(1);
    expect(b.ok && b.version).toBe(2);
    expect(await listSvgFiles(root, source)).toEqual(["fog_AI.svg", "fog_AI_v2.svg"]);
  });

  it("writes nothing when the document is not a valid single-root SVG", async () => {
    const root = makeRoot();
    const out = await saveSvgVersion({
      root, source, code: "<svg><script>alert(1)</script></svg>", prompt: "p", provider: "R", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, sidecar: null,
    });
    expect(out.ok).toBe(false);
    expect(await listSvgFiles(root, source)).toEqual([]);
    expect((await loadSidecar(root, source)).sidecar).toBeNull();
  });

  it("records a failure in the sidecar without writing an SVG file", async () => {
    const rec = recordFailure({
      source, prompt: "p", provider: "Requesty", model: "m", requestedAt: "2026-10-01T10:00:00.000Z",
      error: "rate limited", sidecar: null, status: "failed",
    });
    const sidecar = withVersion(newSidecar({ relPath: source.relPath, name: source.name, fingerprint: source.fingerprint }), rec);
    expect(sidecar.versions).toHaveLength(1);
    expect(sidecar.versions[0].status).toBe("failed");
    expect(sidecar.versions[0].svgPath).toBe("");
    expect(sidecar.versions[0].error).toBe("rate limited");
    expect(toRow(source, sidecar, false).status).toBe("failed");
    expect(parseSidecar(serializeSidecar(sidecar)).ok).toBe(true);
  });

  it("filters, sorts and reports the header checkbox state", () => {
    const mk = (id: string, name: string, status: "generated" | "failed") => ({
      ...toRow({ id, name, stem: name.replace(".png", ""), relPath: `d/${name}`, dirPath: "d", fingerprint: "1:1" , problems: []}, null, false),
      status,
    });
    const list = [mk(FOG, "fog_AI.png", "generated"), mk(COURT, "court_AI.png", "failed")];
    expect(headerState(list, [])).toBe("none");
    expect(headerState(list, [FOG])).toBe("some");
    expect(headerState(list, [FOG, COURT])).toBe("all");
    expect(visibleRows(list, { generation: "failed", review: "all", search: "" }, "name").map((r) => r.source.id)).toEqual([COURT]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "fog" }, "date").map((r) => r.source.id)).toEqual([FOG]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "court_AI" }, "date").map((r) => r.source.id)).toEqual([COURT]);
  });

  it("drops a checked id the rescan removed", () => {
    patchSvg({ checked: [FOG, COURT] });
    const rows = [toRow({ id: FOG, name: "a", stem: "a", relPath: "a", dirPath: "", fingerprint: "1:1" , problems: []}, null, false)];
    pruneChecked(rows);
    expect(getAppState().svg.checked).toEqual([FOG]);
    patchSvg({ checked: [] });
  });
});

describe("runner events and the review decision", () => {
  const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" , problems: []};

  it("maps a saved item onto its row and reloads the sidecars after the run", async () => {
    const root = makeRoot();
    const sidecar = newSidecar({ relPath: source.relPath, name: source.name, fingerprint: source.fingerprint });
    await saveSidecar(root, source, sidecar);
    const r = refs(root);
    r.sidecars.set(FOG, sidecar);
    const rows = [toRow(source, sidecar, false)];
    const written: string[] = [];
    const api: RunSetters = {
      setProgress: (p) => { written.push(`progress:${p === null ? "null" : "set"}`); },
      setProgressFn: (fn) => { written.push(`progressFn:${fn(null) === null ? "null" : "set"}`); },
      setRowsFn: (fn) => { rows.splice(0, rows.length, ...fn(rows)); },
    };
    onRunEvent({ kind: "run-start", batches: 1, perRequest: 4 }, api);
    // a new run clears whatever progress the last one left behind...
    expect(written[0]).toBe("progress:null");
    onRunEvent({ kind: "batch-start", batchId: "b1", index: 1, count: 1, batches: 1, perRequest: 4, cols: 1, rows: 1, composite: "data:,", hash: "h", startedAt: Date.now() }, api);
    // ...then the request in flight is what the strip shows.
    expect(written).toEqual(["progress:null", "progressFn:set"]);
    onRunEvent({ kind: "item-failed", batchId: "b1", position: 1, sourceId: FOG, error: "boom", failure: "malformed", retryAfterMs: null }, api);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toBe("boom");
    // a stall is not a failure: the row says the outcome is unknown
    onRunEvent({ kind: "item-failed", batchId: "b1", position: 1, sourceId: FOG, error: "no data for 600s — the connection looks dead", failure: "stalled", retryAfterMs: null }, api);
    expect(rows[0].status).toBe("unknown");
    expect(rows[0].error).toContain("no data for 600s");
    await reloadSidecars(r, [source], api);
    expect(rows[0].sidecar?.source.relPath).toBe(source.relPath);
  });

  it("names a request that failed instead of hiding it in the totals", () => {
    const outcome = (index: number, status: "done" | "failed", error: string | null) => ({
      id: `batch_${index}_4`, index, count: 4, status, saved: status === "done" ? 4 : 0,
      failed: status === "done" ? 0 : 4, missing: 0,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      cost: { actual: null, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "none" as const },
      error, elapsedMs: 0,
    });
    const line = summaryLine({
      perRequest: 4, batches: 2, saved: 4, failed: 4, missing: 0, invalid: 0, unknown: 0, cancelled: false,
      usage: { input: 100, output: 200, total: 300, cost: 0.01, currency: "USD" }, estimated: null,
      problems: ["icon-5_AI.png: the provider answered 500"], outcomes: [outcome(1, "done", null), outcome(2, "failed", "the provider answered 500")],
    });
    expect(line).toContain("1 request failed");
    expect(line).toContain("4 saved");
    // a clean run never claims a failure
    expect(summaryLine({
      perRequest: 4, batches: 1, saved: 4, failed: 0, missing: 0, invalid: 0, unknown: 0, cancelled: false,
      usage: { input: 1, output: 2, total: 3, cost: 0.01, currency: "USD" }, estimated: null,
      problems: [], outcomes: [outcome(1, "done", null)],
    })).not.toContain("request");
    // a stall is named as an unknown outcome, never folded into "failed"
    const stalled = summaryLine({
      perRequest: 4, batches: 1, saved: 2, failed: 2, missing: 0, invalid: 0, unknown: 1, cancelled: false,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" }, estimated: null,
      problems: ["icon-3_AI.png: no data for 600s at effort high — the connection looks dead"], outcomes: [],
    });
    expect(stalled).toContain("1 request outcome unknown (not resent)");
    expect(stalled).not.toContain("request failed");
  });

  it("summarises a run in one line with the real usage", () => {
    const line = summaryLine({
      perRequest: 4, batches: 2, saved: 3, failed: 1, missing: 0, invalid: 1, unknown: 0, cancelled: false,
      usage: { input: 1000, output: 2000, total: 3000, cost: 0.05, currency: "USD" }, estimated: null, problems: [],
      outcomes: [{
        id: "batch_1_4", index: 1, count: 4, status: "done", saved: 3, failed: 1, missing: 0,
        usage: { input: 1000, output: 2000, total: 3000, cost: 0.05, currency: "USD" },
        cost: { actual: 0.05, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "provider" },
        error: null, elapsedMs: 4_000,
      }],
    });
    expect(line).toBe("SVG generation: 3 saved · 1 invalid · 0 missing · 3,000 tokens · $0.0500 reported");
    expect(summaryLine({
      perRequest: 4, batches: 1, saved: 0, failed: 0, missing: 0, invalid: 0, unknown: 0, cancelled: true, estimated: 0.02,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" }, problems: [], outcomes: [],
    })).toContain("$0.0200 Estimated");
  });

  it("approves the newest version of every named source and pushes ONE entry", async () => {
    const root = makeRoot();
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
    const saved = await saveSvgVersion({
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, sidecar: null,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) await saveSidecar(root, source, saved.sidecar);
    const sidecar = (await loadSidecar(root, source)).sidecar;
    const rows = [toRow(source, sidecar, false)];
    const r = refs(root);
    r.sidecars.set(FOG, sidecar);
    if (sidecar !== null) await saveSidecar(root, source, sidecar);
    const pushed: { label: string; ids: string[] }[] = [];
    const ctx = {
      rows, refs: r, setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => { rows.splice(0, rows.length, ...fn(rows)); },
      say: () => {}, hist: { push: (e: { label: string; ids: string[] }) => pushed.push(e) },
    };
    await decideReview(ctx, [FOG], "approved");
    expect(rows[0].newest?.review).toBe("approved");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].label).toBe("Approve 1 SVG");
    const onDisk = parseSidecar(await (await (await root.getDirectoryHandle("architecture")).getFileHandle("fog_AI.svg.json")).getFile().then((f) => f.text()));
    expect(onDisk.ok && onDisk.sidecar.versions[0].review).toBe("approved");

    const back = await applyReviewPatch(ctx, { recs: [{ id: FOG, version: 1, review: "declined" }] });
    expect(back).toBe(true);
    expect(rows[0].newest?.review).toBe("declined");
  });

  it("refuses to review a source with no generated version", async () => {
    const rows = [toRow(source, null, false)];
    const said: string[] = [];
    await decideReview({
      rows, refs: refs(), setRowsFn: () => {}, say: (m) => said.push(m), hist: { push: () => {} },
    }, [FOG], "approved");
    expect(said).toEqual(["No generated SVG to review yet"]);
  });
});

const CFG = { baseUrl: "u", model: "m", timeoutMs: 1000, retries: 0, concurrency: 1, imagesPerRequest: 4, maxTokens: 0 };
const VIEW_PREFS = { thumb: 84, providerOpen: true, bg: { preset: "white", custom: "#808080" } } as const;

describe("state reducer and preview", () => {
  it("starts from the documented defaults and applies every action once", () => {
    const start = initialModel(CFG, "prompt", VIEW_PREFS);
    expect(start.filter).toEqual({ generation: "all", review: "all", search: "" });
    expect(start.keyMask).toBe("not set");
    expect(reduceState(start, { type: "key", key: "not-a-real-key-value-1234" }).keySet).toBe(true);
    expect(reduceState(start, { type: "key", key: "not-a-real-key-value-1234" }).keyMask).not.toContain("1234567890");
    expect(reduceState(start, { type: "rows-fn", fn: (rows) => rows }).rows).toEqual([]);
    expect(reduceState(start, { type: "progress", progress: null }).progress).toBeNull();
    const patched = reduceState(reduceState(start, { type: "progress", progress: {
      batchId: "b", index: 1, batches: 1, count: 1, cols: 1, rows: 1, composite: "", hash: "h",
      saved: 0, failed: 0, missing: 0, perRequest: 4, startedAt: Date.now(), outcomes: [],
    } }), { type: "progress-fn", fn: (p) => (p ? { ...p, saved: 2 } : p) });
    expect(patched.progress?.saved).toBe(2);
    expect(reduceState(start, { type: "filter", patch: { search: "fog" } }).filter.search).toBe("fog");
    expect(reduceState(start, { type: "thumb", px: 120 }).thumb).toBe(120);
    expect(reduceState(start, { type: "dialog", dialog: null }).dialog).toBeNull();
  });

  it("remembers the zoom, the card's state and the preview background", () => {
    localStorage.setItem(SVG_PREFS_KEY, JSON.stringify({ thumbHeight: 132, providerOpen: false }));
    expect(loadSvgPrefs()).toEqual({ thumbHeight: 132, providerOpen: false, previewBg: DEFAULT_PREVIEW_BACKGROUND });
    saveSvgPrefs({ thumbHeight: 96, providerOpen: false, previewBg: { preset: "black", custom: "#123456" } });
    expect(loadSvgPrefs()).toEqual({ thumbHeight: 96, providerOpen: false, previewBg: { preset: "black", custom: "#123456" } });
    localStorage.removeItem(SVG_PREFS_KEY);
  });

  it("shows the model card when the stored value is missing or not a boolean", () => {
    expect(parseSvgPrefs({})).toEqual({ ...DEFAULT_SVG_PREFS, providerOpen: true });
    expect(parseSvgPrefs({ providerOpen: "closed" })).toEqual({ ...DEFAULT_SVG_PREFS, providerOpen: true });
    expect(parseSvgPrefs({ thumbHeight: 140 })).toEqual({ ...DEFAULT_SVG_PREFS, thumbHeight: 140, providerOpen: true });
    expect(parseSvgPrefs(null)).toEqual(DEFAULT_SVG_PREFS);
  });

  it("minimizes and restores the model card through one action", () => {
    const start = initialModel(CFG, "prompt", VIEW_PREFS);
    expect(start.providerOpen).toBe(true);
    const closed = reduceState(start, { type: "provider-open", open: false });
    expect(closed.providerOpen).toBe(false);
    expect(closed.config).toBe(start.config); // nothing else moved
    expect(initialModel(CFG, "prompt", { ...VIEW_PREFS, providerOpen: false }).providerOpen).toBe(false);
  });

  it("bumps the root token so no preview can outlive its folder", () => {
    expect(initialModel(CFG, "prompt", VIEW_PREFS).rootToken).toBe(0);
    const start = initialModel(CFG, "prompt", VIEW_PREFS);
    expect(reduceState(start, { type: "root-token" }).rootToken).toBe(1);
    expect(reduceState(reduceState(start, { type: "root-token" }), { type: "root-token" }).rootToken).toBe(2);
    expect(reduceState(start, { type: "root", name: "split_root" }).rootToken).toBe(1);
  });
});

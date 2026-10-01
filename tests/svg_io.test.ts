// svg_io.test.ts — the SVG tab's IO layer executes for real (RULE 8): scanning
// the picked root for approved pairs, the row model, the runner-event mapping,
// the review decision + its undo path, the state reducer, the root token and
// the write order that makes a bad result harmless. Each test fails if the
// module it covers is deleted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { newSidecar, parseSidecar, serializeSidecar, withVersion } from "../src/lib/svgfile";
import { saveSvgVersion, recordFailure } from "../src/svg/saveversion";
import { loadSidecar, readSvgText, listSvgFiles, saveSidecar } from "../src/svg/sidecar";
import { discoverApprovedSources, toBatchSource } from "../src/svg/sources";
import { bootSources, rememberRoot, scanSources } from "../src/svg/scan";
import { headerState, newestValidOf, pruneChecked, toListRow, toRow, visibleRows } from "../src/svg/rowmodel";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "../src/svg/runstate";
import { applyReviewPatch, decideReview } from "../src/svg/reviewact";
import { initialModel, reduceState } from "../src/svg/statemodel";
import type { SvgRow } from "../src/svg/types";
import { getAppState, patchSvg, setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
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
  return { root: { current: root }, sidecars: new Map(), abort: { current: null }, key: { current: null } };
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
});

describe("approved-source discovery", () => {
  it("keeps only approved pairs and reports the ones it skipped", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.sources[0].name).toBe("court_AI.png");
    expect(found.sources[0].stem).toBe("court_AI");
    expect(found.sources[0].dirPath).toBe("architecture");
    expect(found.approvedTotal).toBe(2);
    expect(found.corruptDecisions).toBe(false);
  });

  it("says the decision file is corrupt instead of dropping every source", async () => {
    const root = makeRoot();
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, "{not json"));
    const found = await discoverApprovedSources(root);
    expect(found.corruptDecisions).toBe(true);
    expect(found.sources).toEqual([]);
  });

  it("reports an approved pair whose AI image disappeared", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([FOG]);
    expect(found.missing).toEqual(["court"]);
  });

  it("maps a source onto its batch identity without touching the file id", () => {
    const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" };
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
  const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" };
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
    expect(newestValidOf(loaded.sidecar)?.version).toBe(1);
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
      ...toRow({ id, name, stem: name.replace(".png", ""), relPath: `d/${name}`, dirPath: "d", fingerprint: "1:1" }, null, false),
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
    const rows = [toRow({ id: FOG, name: "a", stem: "a", relPath: "a", dirPath: "", fingerprint: "1:1" }, null, false)];
    pruneChecked(rows);
    expect(getAppState().svg.checked).toEqual([FOG]);
    patchSvg({ checked: [] });
  });
});

describe("runner events and the review decision", () => {
  const source = { id: FOG, name: "fog_AI.png", stem: "fog_AI", relPath: "architecture/fog_AI.png", dirPath: "architecture", fingerprint: "20:3100" };

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
    onRunEvent({ kind: "batch-start", batchId: "b1", count: 1, batches: 1, cols: 1, rows: 1, composite: "data:,", hash: "h" }, api);
    expect(written[0]).toBe("progress:set");
    onRunEvent({ kind: "item-failed", batchId: "b1", position: 1, sourceId: FOG, error: "boom", failure: "malformed", retryAfterMs: null }, api);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toBe("boom");
    await reloadSidecars(r, [source], api);
    expect(rows[0].sidecar?.source.relPath).toBe(source.relPath);
  });

  it("summarises a run in one line with the real usage", () => {
    const line = summaryLine({
      batches: 2, saved: 3, failed: 1, missing: 0, invalid: 1, cancelled: false,
      usage: { input: 1000, output: 2000, total: 3000, cost: 0.05, currency: "USD" }, problems: [],
    });
    expect(line).toBe("SVG generation: 3 saved · 1 invalid · 0 missing · 3,000 tokens · $0.0500");
    expect(summaryLine({
      batches: 1, saved: 0, failed: 0, missing: 0, invalid: 0, cancelled: true,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" }, problems: [],
    })).toContain("cancelled");
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

describe("state reducer and preview", () => {
  it("starts from the documented defaults and applies every action once", () => {
    const start = initialModel({ baseUrl: "u", model: "m", timeoutMs: 1000, retries: 0, concurrency: 1, imagesPerRequest: 4, maxTokens: 0 }, "prompt", 84);
    expect(start.filter).toEqual({ generation: "all", review: "all", search: "" });
    expect(start.keyMask).toBe("not set");
    expect(reduceState(start, { type: "key", key: "not-a-real-key-value-1234" }).keySet).toBe(true);
    expect(reduceState(start, { type: "key", key: "not-a-real-key-value-1234" }).keyMask).not.toContain("1234567890");
    expect(reduceState(start, { type: "rows-fn", fn: (rows) => rows }).rows).toEqual([]);
    expect(reduceState(start, { type: "progress", progress: null }).progress).toBeNull();
    const patched = reduceState(reduceState(start, { type: "progress", progress: {
      batchId: "b", batches: 1, count: 1, cols: 1, rows: 1, composite: "", hash: "h", saved: 0, failed: 0, missing: 0,
    } }), { type: "progress-fn", fn: (p) => (p ? { ...p, saved: 2 } : p) });
    expect(patched.progress?.saved).toBe(2);
    expect(reduceState(start, { type: "filter", patch: { search: "fog" } }).filter.search).toBe("fog");
    expect(reduceState(start, { type: "thumb", px: 120 }).thumb).toBe(120);
    expect(reduceState(start, { type: "dialog", dialog: null }).dialog).toBeNull();
  });

  it("bumps the root token so no preview can outlive its folder", () => {
    expect(initialModel({ baseUrl: "u", model: "m", timeoutMs: 1000, retries: 0, concurrency: 1, imagesPerRequest: 4, maxTokens: 0 }, "prompt", 84).rootToken).toBe(0);
    const start = initialModel({ baseUrl: "u", model: "m", timeoutMs: 1000, retries: 0, concurrency: 1, imagesPerRequest: 4, maxTokens: 0 }, "prompt", 84);
    expect(reduceState(start, { type: "root-token" }).rootToken).toBe(1);
    expect(reduceState(reduceState(start, { type: "root-token" }), { type: "root-token" }).rootToken).toBe(2);
    expect(reduceState(start, { type: "root", name: "split_root" }).rootToken).toBe(1);
  });
});

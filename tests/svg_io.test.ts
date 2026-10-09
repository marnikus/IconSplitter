// svg_io.test.ts — the SVG tab's IO layer executes for real (RULE 8): scanning
// the picked root for approved pairs, the row model, the runner-event mapping,
// the review decision + its undo path, the state reducer, the root token and
// the write order that makes a bad result harmless. Each test fails if the
// module it covers is deleted. Decisions AND the SVG history live in ONE file
// beside the images (I-41) — the legacy global file is only ever read (I-42).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { chosenVersion, newestValid } from "../src/lib/svgfile";
import { metaFileName, parsePairMeta, serializePairMeta, type PairMeta } from "../src/lib/pairmeta";
import { saveSvgVersion, metaAfterFailure } from "../src/svg/saveversion";
import { readSvgText, listSvgFiles } from "../src/svg/svgfiles";
import { loadMetaAt, saveMetaAt, LEGACY_FILE } from "../src/selection/pairstore";
import { discoverApprovedSources, toBatchSource, type SvgSource } from "../src/svg/sources";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { bootSources, rememberRoot, scanSources } from "../src/svg/scan";
import { scanKey } from "../src/svg/scankey";
import type { Discovery } from "../src/svg/sources";
import { headerState, previewTargetOf, pruneChecked, shownVersion, sortedIds, toListRow, toRow, visibleRows } from "../src/svg/rowmodel";
import { pinOrder } from "../src/lib/svglist";
import { onRunEvent, reloadSidecars, summaryLine, type RunSetters } from "../src/svg/runstate";
import { applyReviewPatch, decideReview } from "../src/svg/reviewact";
import { initialModel, reduceState } from "../src/svg/statemodel";
import { DEFAULT_SVG_PREFS, SVG_PREFS_KEY, loadSvgPrefs, parseSvgPrefs, saveSvgPrefs } from "../src/svg/prefsstore";
import { DEFAULT_PREVIEW_BACKGROUND } from "../src/lib/svgbackground";
import type { SvgRow } from "../src/svg/types";
import { getAppState, patchSvg, setAppState } from "../src/state/appstore";
import { FakeDir, FakeFile, LockedFile } from "./helpers/fakefs";
import { clearKnownRoots, deriveRootPath } from "../src/ui/knownroots";
import { loadRootPath, saveRootPathInfo } from "../src/lib/rootpath";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";
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

/** The clipboard as the app sees it at pick/rescan time. */
function stubClipboardRead(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

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
const HARBOR = pairId("coastal", "harbor", "");

const FOG_SRC = svgSource(FOG, { name: "fog_AI.png" });
const COURT_SRC = svgSource(COURT, { name: "court_AI.png", sourceName: "court.png" });


/** An approval click, as the Selection tab writes it: one file, beside the pair. */
async function approve(root: FakeDir, source: SvgSource): Promise<void> {
  await saveMetaAt(root, source.metaPath, pairMetaFor(source, [], "approved"));
}

/** makeRoot + the pair-file approvals a Selection run would have left behind. */
async function approvedRoot(...sources: SvgSource[]): Promise<FakeDir> {
  const root = makeRoot();
  for (const source of sources) await approve(root, source);
  return root;
}

/** The legacy global file, for the tests that pin the read-only fallback. */
function decisionsJson(...approved: string[]): string {
  const recs = [FOG, COURT, HARBOR].map((id) => ({
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
    root: { current: root }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null },
    scanKey: { current: null }, seq: { current: SCAN_IDLE },
  };
}

beforeEach(async () => {
  await dropDb();
  setAppState({});
  localStorage.clear(); // the path memory is one storage key; a test must not inherit it
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("approved-source discovery", () => {
  it("lists every approved pair, in path order, with no problems when healthy", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.sources[0].name).toBe("court_AI.png");
    expect(found.sources[0].stem).toBe("court_AI");
    expect(found.sources[0].dirPath).toBe("architecture");
    expect(found.sources[0].metaPath).toBe("architecture/court_AI.svg.json");
    expect(found.sources.every((s) => s.problems.length === 0)).toBe(true);
    expect(found.problems).toEqual([]);
    expect(found.excluded).toEqual([]);
    expect(found.unreadable).toEqual([]);
    expect(found.corruptDecisions).toBe(false);
    expect(found.audit).toEqual({ files: 8, aiSources: 3, references: 3, missing: 0, duplicates: 0, rows: 2 });
  });

  it("reads the decision AND the versions from the same pair file", async () => {
    const root = makeRoot();
    await saveMetaAt(root, FOG_SRC.metaPath, pairMetaFor(FOG_SRC, [svgVersionRecord(FOG_SRC, 1)], "approved"));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([FOG]);
    expect(found.metas.get(FOG)?.versions.map((v) => v.version)).toEqual([1]);
    expect(found.corruptFiles).toEqual([]);
  });

  it("still reads the legacy global file for a pair that has no file of its own", async () => {
    const root = makeRoot();
    root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 10, 10, decisionsJson(FOG, COURT)));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.corruptDecisions).toBe(false);
  });

  it("names a corrupt pair file and keeps every other decision", async () => {
    const root = await approvedRoot(FOG_SRC);
    const arch = await root.getDirectoryHandle("architecture");
    arch.children.set(metaFileName("court_AI.png"), new FakeFile(metaFileName("court_AI.png"), 9, 9, "{nope"));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([FOG]);
    expect(found.corruptFiles).toEqual(["architecture/court_AI.svg.json"]);
    expect(found.corruptDecisions).toBe(false);
  });

  it("says the legacy decision file is corrupt instead of dropping every source", async () => {
    const root = makeRoot();
    root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 10, 10, "{not json"));
    const found = await discoverApprovedSources(root);
    expect(found.corruptDecisions).toBe(true);
    expect(found.sources).toEqual([]);
  });

  it("drops an approved pair whose AI image disappeared, with the reason reported", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    const found = await discoverApprovedSources(root);
    // only the real AI output is a row; the surviving reference is explained
    expect(found.sources.map((s) => s.id)).toEqual([FOG]);
    expect(found.problems).toEqual([]);
    expect(found.excluded).toEqual([{
      id: COURT, relPath: "architecture/court.png", kind: "ai-missing",
      reason: "no AI result (court_AI.png) beside architecture/court.png",
    }]);
    expect(found.audit).toMatchObject({ files: 7, aiSources: 2, references: 3, missing: 1, duplicates: 0, rows: 1 });
    expect(found.unreadable).toEqual([]);
  });

  it("answers byte-identically whatever order the filesystem enumerated", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const first = await discoverApprovedSources(root);
    const again = await discoverApprovedSources(root);
    const flipped = await discoverApprovedSources(mirrored(root));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    expect(JSON.stringify(flipped)).toBe(JSON.stringify(first));
  });

  it("writes nothing into the scanned root", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const before = [...root.children.keys()];
    const arch = await root.getDirectoryHandle("architecture");
    const beforeArch = [...arch.children.keys()];
    await discoverApprovedSources(root);
    expect([...root.children.keys()]).toEqual(before);
    expect([...arch.children.keys()]).toEqual(beforeArch);
  });

  it("reports an unreadable file with its path and never as a vanished pair", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
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
    expect(found.audit.rows).toBe(2); // a file that cannot be read still exists
  });

  it("reports an approved record whose every file is gone, and lists nothing for it", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    await arch.removeEntry("court_AI.png");
    await arch.removeEntry("court.png");
    const rec = {
      pair_id: COURT, source: "architecture/court.png", ai_result: "architecture/court_AI.png",
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    };
    root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 10, 10, JSON.stringify({ records: [rec] })));
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]);
    expect(found.excluded).toEqual([{
      id: COURT, relPath: "architecture/court_AI.png", kind: "no-files",
      reason: "only the decision record remains for architecture/court_AI.png",
    }]);
    expect(found.audit).toMatchObject({ files: 5, aiSources: 2, references: 2, missing: 1, rows: 0 });
  });

  it("ignores this app's own version artifacts instead of inventing a row", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const arch = await root.getDirectoryHandle("architecture");
    arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", 30, 3200, "<svg/>"));
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.id)).toEqual([COURT, FOG]);
    expect(found.problems).toEqual([]);
  });

  it("maps a source onto its batch identity without touching the file id", () => {
    expect(toBatchSource(FOG_SRC)).toEqual({ sourceId: FOG, name: "fog_AI", relPath: "architecture/fog_AI.png", fingerprint: "20:3100" });
  });
});

describe("scanSources", () => {
  it("loads every pair file and reports what could not be used", async () => {
    const root = await approvedRoot(FOG_SRC, COURT_SRC);
    const r = refs(root);
    const s = setters();
    await scanSources(r, s.api);
    expect(s.out.rows).toHaveLength(2);
    expect(s.out.busy).toBeNull();
    // one bumped token per scan: a row's preview re-reads the file it shows
    expect(s.out.tokens).toBe(1);
    const rows = s.out.rows as { source: { id: string }; meta: PairMeta | null }[];
    expect(rows.every((row) => row.meta?.decision === "approved")).toBe(true);
    expect(r.metas.size).toBe(2);
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

  it("captures the path on a rescan when the pick missed it (I-52)", async () => {
    const root = makeRoot();
    const s = setters();
    stubClipboardRead(async () => "F:\\work\\split_root");
    await scanSources(refs(root), s.api);
    expect(loadRootPath(root.name)).toBe("F:\\work\\split_root");
    expect(s.out.said.join(" ")).toContain("Folder path captured");
  });

  it("remembers the restored folder at boot, so a pick inside it is named exactly (I-51)", async () => {
    const root = makeRoot();
    root.children.set("2026-10", new FakeDir("2026-10")); // a folder inside it, not yet picked
    saveRootPathInfo(root.name, "F:\\work\\split_root");
    await rememberRoot(root);
    const r = refs();
    await bootSources(r, { setRootName: () => {}, loadAll: () => {}, refreshKey: () => {} });
    // the folder that was just restored reports where a pick inside it lives —
    // no clipboard involved
    const child = root.children.get("2026-10") as FakeDir;
    expect(await deriveRootPath(child)).toEqual({ kind: "derived", path: "F:\\work\\split_root\\2026-10" });
    clearKnownRoots();
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
  const source = FOG_SRC;
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

  it("marks a source with no pair file as not generated", () => {
    const row = toRow(source, null, false);
    expect(row.status).toBe("not-generated");
    expect(row.newest).toBeNull();
    expect(row.approved).toBeNull();
    expect(toListRow(row)).toMatchObject({ generation: "not-generated", review: "pending", version: 0, tokens: null, cost: null });
  });

  it("previews the newest VALID version and flags a corrupt pair file", async () => {
    const root = makeRoot();
    const arch = await root.getDirectoryHandle("architecture");
    const dir = arch as unknown as FakeDir;
    const first = await saveSvgVersion({
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
      requestedAt: "2026-10-01T10:00:00.000Z",
      usage: { input: 100, output: 200, total: 300, cost: 0.01, currency: "USD" },
      batch: null, requestId: null, meta: null,
    });
    expect(first.ok).toBe(true);
    if (first.ok) await saveMetaAt(root, source.metaPath, first.meta);
    const loaded = await loadMetaAt(root, source.metaPath);
    const row = toRow(source, loaded.meta, loaded.corrupt);
    expect(row.status).toBe("generated");
    expect(row.newest?.version).toBe(1);
    expect(newestValid(loaded.meta?.versions ?? [])?.version).toBe(1);
    expect(toListRow(row).tokens).toBe(300);
    expect(toListRow(row).cost).toBe(0.01);
    expect(await readSvgText(root, first.ok ? first.svgPath : "")).toBe(svg);
    expect(await listSvgFiles(root, source)).toEqual(["fog_AI.svg"]);
    expect(dir.children.has("fog_AI.svg")).toBe(true);
    expect(dir.children.has(metaFileName("fog_AI.png"))).toBe(true);
  });

  it("never overwrites: the next save is version 2", async () => {
    const root = makeRoot();
    const args = {
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, meta: null as PairMeta | null,
    };
    const a = await saveSvgVersion(args);
    const b = await saveSvgVersion({ ...args, meta: a.ok ? a.meta : null });
    expect(a.ok && a.version).toBe(1);
    expect(b.ok && b.version).toBe(2);
    expect(await listSvgFiles(root, source)).toEqual(["fog_AI.svg", "fog_AI_v2.svg"]);
  });

  it("keeps the pair's decision when a version is saved", async () => {
    const root = await approvedRoot(FOG_SRC);
    const out = await saveSvgVersion({
      root, source, code: svg, prompt: "p", provider: "R", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, meta: pairMetaFor(FOG_SRC, [], "approved"),
    });
    expect(out.ok && out.meta.decision).toBe("approved");
    expect(out.ok && out.meta.versions).toHaveLength(1);
  });

  it("writes nothing when the document is not a valid single-root SVG", async () => {
    const root = makeRoot();
    const out = await saveSvgVersion({
      root, source, code: "<svg><script>alert(1)</script></svg>", prompt: "p", provider: "R", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, meta: null,
    });
    expect(out.ok).toBe(false);
    expect(await listSvgFiles(root, source)).toEqual([]);
    expect((await loadMetaAt(root, source.metaPath)).meta).toBeNull();
  });

  it("records a failure in the pair file without writing an SVG file", async () => {
    const rec = metaAfterFailure({
      source, prompt: "p", provider: "Requesty", model: "m", requestedAt: "2026-10-01T10:00:00.000Z",
      error: "rate limited", meta: null, status: "failed",
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
    });
    expect(rec.versions).toHaveLength(1);
    expect(rec.versions[0].status).toBe("failed");
    expect(rec.versions[0].svgPath).toBe("");
    expect(rec.versions[0].error).toBe("rate limited");
    expect(toRow(source, rec, false).status).toBe("failed");
    expect(parsePairMeta(serializePairMeta(rec)).ok).toBe(true);
  });

  it("filters, sorts and reports the header checkbox state", () => {
    const mk = (source: SvgSource, status: "generated" | "failed") => ({ ...toRow(source, null, false), status });
    const list = [mk(FOG_SRC, "generated"), mk(COURT_SRC, "failed")];
    expect(headerState(list, [])).toBe("none");
    expect(headerState(list, [FOG])).toBe("some");
    expect(headerState(list, [FOG, COURT])).toBe("all");
    expect(visibleRows(list, { generation: "failed", review: "all", search: "" }, "name").map((r) => r.source.id)).toEqual([COURT]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "fog" }, "date").map((r) => r.source.id)).toEqual([FOG]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "court_AI" }, "date").map((r) => r.source.id)).toEqual([COURT]);
  });

  it("pins the list order: a result that lands never moves a row; a re-sort does (2026-10-08)", () => {
    // pinOrder: what was there keeps its place; newcomers follow in sorted order; gone ids go
    expect(pinOrder(["b", "a"], ["a", "b"])).toEqual(["b", "a"]);
    expect(pinOrder(["b", "a"], ["c", "a", "b", "d"])).toEqual(["b", "a", "c", "d"]);
    expect(pinOrder(["b", "x", "a"], ["a", "b"])).toEqual(["b", "a"]);
    expect(pinOrder([], ["a", "b"])).toEqual(["a", "b"]);
    // visibleRows under a pin: date sort would put the newest first, the pin keeps court first
    const older = { ...toRow(FOG_SRC, null, false), status: "generated" as const };
    const list = [older, { ...toRow(COURT_SRC, null, false), status: "generated" as const }];
    const pinned = sortedIds(list, "name"); // [court, fog]
    expect(pinned).toEqual([COURT, FOG]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "" }, "date", pinned).map((r) => r.source.id)).toEqual([COURT, FOG]);
    expect(visibleRows(list, { generation: "all", review: "all", search: "fog" }, "date", pinned).map((r) => r.source.id)).toEqual([FOG]);
    // the reducer: a scan (`rows`), a sort change and `repin` refresh the pin; a run event (`rows-fn`) never does
    const start = reduceState(initialModel(CFG, "prompt", VIEW_PREFS), { type: "sort", sort: "name" });
    const scanned = reduceState(start, { type: "rows", rows: list });
    expect(scanned.order).toEqual([COURT, FOG]);
    const landed = reduceState(scanned, { type: "rows-fn", fn: (rows) => [rows[1], rows[0]] });
    expect(landed.order).toEqual([COURT, FOG]); // untouched by the event
    expect(reduceState(landed, { type: "sort", sort: "date" }).order).toHaveLength(2);
    expect(reduceState(landed, { type: "repin" }).order).toEqual(sortedIds(landed.rows, "name"));
  });

  it("drops a checked id the rescan removed", () => {
    patchSvg({ checked: [FOG, COURT] });
    const rows = [toRow(svgSource(FOG), null, false)];
    pruneChecked(rows);
    expect(getAppState().svg.checked).toEqual([FOG]);
    patchSvg({ checked: [] });
  });
});

describe("the version a row shows is the user's choice (I-54)", () => {
  const source = FOG_SRC;
  const v1 = svgVersion("architecture/fog_AI.svg", { version: 1, usage: { input: 1, output: 2, total: 11 } });
  const v2 = svgVersion("architecture/fog_AI_v2.svg", { version: 2, usage: { input: 1, output: 2, total: 22 } });
  const failed3 = svgVersion("", { version: 3, status: "failed", valid: false, error: "invalid SVG" });
  const discovery = (rows: SvgRow[]): Discovery => ({
    sources: [], problems: [], excluded: [], unreadable: [], corruptDecisions: false,
    metas: new Map(), corruptFiles: [], fileIndex: new Map<string, string>(),
    audit: { files: 0, aiSources: 0, references: 0, missing: 0, duplicates: 0, rows: rows.length },
  });

  it("shows the newest valid version when nobody chose one", () => {
    const row = toRow(source, pairMetaFor(source, [v1, v2], "approved", null), false);
    expect(row.newest?.version).toBe(2);
    expect(row.preferred).toBeNull();
    expect(shownVersion(row)?.version).toBe(2);
    expect(previewTargetOf(row)).toEqual({ version: 2, svgPath: "architecture/fog_AI_v2.svg" });
    expect(toListRow(row)).toMatchObject({ version: 2, tokens: 22 });
  });

  it("shows the chosen version even when a newer one exists, and keeps the newer one", () => {
    const row = toRow(source, pairMetaFor(source, [v1, v2], "approved", 1), false);
    expect(row.newest?.version).toBe(2); // what exists is untouched...
    expect(row.preferred?.version).toBe(1); // ...and what is SHOWN is the choice
    expect(shownVersion(row)?.version).toBe(1);
    expect(previewTargetOf(row)).toEqual({ version: 1, svgPath: "architecture/fog_AI.svg" });
    expect(toListRow(row)).toMatchObject({ version: 1, tokens: 11 });
    expect(row.meta?.versions.map((v) => v.version)).toEqual([1, 2]); // all re-choosable
  });

  it("falls back to the newest valid version when the choice cannot be shown", () => {
    // a version number the history does not have (a file deleted by hand)
    expect(chosenVersion([v1, v2], 9)?.version).toBe(2);
    // a version that failed validation: its cost is recorded, its artwork is not
    expect(chosenVersion([v1, v2, failed3], 3)?.version).toBe(2);
    const row = toRow(source, pairMetaFor(source, [v1, v2, failed3], "approved", 3), false);
    expect(row.preferred).toBeNull();
    expect(shownVersion(row)?.version).toBe(2);
    expect(toListRow(row).version).toBe(2);
  });

  it("always answers with a usable version or nothing at all", () => {
    expect(chosenVersion([], 1)).toBeNull();
    expect(chosenVersion([failed3], 3)).toBeNull();
    expect(chosenVersion([failed3], null)).toBeNull();
  });

  it("re-commits the snapshot when the choice changes (D7)", () => {
    const one = toRow(source, pairMetaFor(source, [v1, v2], "approved", 1), false);
    const two = toRow(source, pairMetaFor(source, [v1, v2], "approved", 2), false);
    const d = discovery([one]);
    expect(scanKey("split_root", d, [one])).not.toBe(scanKey("split_root", d, [two]));
  });
});

describe("runner events and the review decision", () => {
  const source = FOG_SRC;

  it("maps a saved item onto its row and reloads the pair files after the run", async () => {
    const root = makeRoot();
    const meta = pairMetaFor(source, [svgVersionRecord(source, 1)], "approved");
    await saveMetaAt(root, source.metaPath, meta);
    const r = refs(root);
    r.metas.set(FOG, meta);
    const rows = [toRow(source, meta, false)];
    const written: string[] = [];
    const api: RunSetters = {
      setProgress: (p) => { written.push(`progress:${p === null ? "null" : "set"}`); },
      setProgressFn: (fn) => { written.push(`progressFn:${fn(null) === null ? "null" : "set"}`); },
      setRowsFn: (fn) => { rows.splice(0, rows.length, ...fn(rows)); },
    };
    onRunEvent({ kind: "run-start", batches: 1, perRequest: 4, images: 1 }, api);
    // a new run clears whatever progress the last one left behind...
    expect(written[0]).toBe("progress:null");
    onRunEvent({ kind: "batch-start", runId: "run_1", batchId: "b1", index: 1, count: 1, batches: 1, perRequest: 4, cols: 1, rows: 1, composite: "data:,", hash: "h", startedAt: Date.now(), images: 1 }, api);
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
    expect(rows[0].meta?.ai.relPath).toBe(source.relPath);
  });

  it("names a request that failed instead of hiding it in the totals", () => {
    const outcome = (index: number, status: "done" | "failed", error: string | null) => ({
      id: `batch_${index}_4`, index, count: 4, status, saved: status === "done" ? 4 : 0,
      failed: status === "done" ? 0 : 4, missing: 0,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      cost: { actual: null, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "none" as const },
      error, requestId: null, elapsedMs: 0,
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
        error: null, requestId: null, elapsedMs: 4_000,
      }],
    });
    expect(line).toBe("SVG generation: 3 saved · 1 invalid · 0 missing · 3,000 tokens · $0.0500 reported");
    expect(summaryLine({
      perRequest: 4, batches: 1, saved: 0, failed: 0, missing: 0, invalid: 0, unknown: 0, cancelled: true, estimated: 0.02,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" }, problems: [], outcomes: [],
    })).toContain("$0.0200 Estimated");
  });

  it("approves the newest version of every named source, in its OWN file, and pushes ONE entry", async () => {
    const root = makeRoot();
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
    const saved = await saveSvgVersion({
      root, source, code: svg, prompt: "p", provider: "Requesty", model: "m",
      requestedAt: "2026-10-01T10:00:00.000Z", usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      batch: null, requestId: null, meta: pairMetaFor(source, [], "approved"),
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) await saveMetaAt(root, source.metaPath, saved.meta);
    const meta = (await loadMetaAt(root, source.metaPath)).meta;
    const rows = [toRow(source, meta, false)];
    const r = refs(root);
    if (meta !== null) r.metas.set(FOG, meta);
    const pushed: { label: string; ids: string[] }[] = [];
    const ctx = {
      rows, refs: r, setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => { rows.splice(0, rows.length, ...fn(rows)); },
      say: () => {}, hist: { push: (e: { label: string; ids: string[] }) => pushed.push(e) },
    };
    await decideReview(ctx, [FOG], "approved");
    expect(rows[0].newest?.review).toBe("approved");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].label).toBe("Approve 1 SVG");
    const onDisk = parsePairMeta(await (await (await root.getDirectoryHandle("architecture")).getFileHandle("fog_AI.svg.json")).getFile().then((f) => f.text()));
    expect(onDisk.ok && onDisk.meta.versions[0].review).toBe("approved");
    expect(onDisk.ok && onDisk.meta.decision).toBe("approved"); // the pair decision is untouched

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
      runId: "run_1", batchId: "b", index: 1, batches: 1, count: 1, cols: 1, rows: 1, composite: "", hash: "h", images: 1,
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

/** The version record a save would have written for this source. */
function svgVersionRecord(source: SvgSource, version: number) {
  return svgVersion(`${source.dirPath}/${source.stem}${version === 1 ? "" : `_v${version}`}.svg`, { version });
}

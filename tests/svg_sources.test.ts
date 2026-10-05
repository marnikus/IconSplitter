// svg_sources.test.ts — the Generate SVG list's selection rules (RULE 4/6/24).
// The root below is the one in the report: a batch output tree whose decision
// file remembers files that are no longer where the ids say they are, a record
// with no AI result at all (a reference image), and the same AI image named by
// two records. Two symptoms were reported and must never come back:
//   1. the same AI source listed twice;
//   2. a reference image (no `_AI`) offered as an image to generate from.
// A row exists iff an approved decision names an AI path that really is on disk
// and carries the canonical `_AI` name; everything else is reported, not listed.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { scanKey } from "../src/svg/scankey";
import { discoverApprovedSources, type Discovery } from "../src/svg/sources";
import { auditText } from "../src/svg/sourcelist";
import { toRow } from "../src/svg/rowmodel";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const OUT = "_split_output/2026-10/2026-10-01_10-24-31";
const BUNNY_DIR = `${OUT}/icon-bunny-face_AI_5/split_01`;
const BUNNY = "icon-bunny-face_AI_5_01.png";
const BUNNY_STALE = pairId("somewhere/else", "icon-bunny-face", "_5_01");
const BUNNY_REAL = pairId(BUNNY_DIR, "icon-bunny-face", "_5_01");
const PLANE = "icon-airplane-landing.png";

const SIDECAR = JSON.stringify({
  v: 1,
  source: { relPath: `${BUNNY_DIR}/${BUNNY}`, name: BUNNY, fingerprint: "20:3100" },
  versions: [1, 2, 5].map((v) => ({
    version: v, svgPath: `${BUNNY_DIR}/icon-bunny-face_AI_5_01_v${v}.svg`, status: "generated",
    review: "pending", prompt: "p", provider: "Requesty", model: "m",
    requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
    usage: { input: 1, output: 2, total: 3 },
    cost: { actual: null, estimated: null, currency: "USD", pricing: "p", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 1 },
    batch: null, error: null, requestId: null,
  })),
});

interface Rec {
  pair_id: string; source: string | null; ai_result: string | null;
  decision: "approved" | "declined" | "pending"; reviewed_at: string;
}

function record(pair_id: string, source: string | null, ai_result: string | null, decision: Rec["decision"] = "approved"): Rec {
  return { pair_id, source, ai_result, decision, reviewed_at: "2026-10-01T09:00:00.000Z" };
}

function dir(root: FakeDir, path: string): FakeDir {
  let node = root;
  for (const part of path.split("/")) {
    const child = node.children.get(part);
    if (child instanceof FakeDir) node = child;
    else {
      const made = new FakeDir(part);
      node.children.set(part, made);
      node = made;
    }
  }
  return node;
}

function withDecisions(root: FakeDir, records: Rec[]): FakeDir {
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records })));
  return root;
}

/**
 * The reported tree: one AI output with a sidecar and old versions, two
 * reference images whose records never had an AI result, and a second record
 * for the same bunny path (an id from before the file moved).
 */
function reportedRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  const bunny = dir(root, BUNNY_DIR);
  bunny.children.set(BUNNY, new FakeFile(BUNNY, 20, 3100, "ai"));
  bunny.children.set("icon-bunny-face_AI_5_01_v5.svg", new FakeFile("icon-bunny-face_AI_5_01_v5.svg", 40, 3300, "<svg/>"));
  bunny.children.set(`${BUNNY}.svg.json`, new FakeFile(`${BUNNY}.svg.json`, 10, 3300, SIDECAR));
  for (const split of ["01", "02"]) {
    const plane = dir(root, `${OUT}/icon-airplane-landing_AI_8/split_${split}`);
    plane.children.set(PLANE, new FakeFile(PLANE, 12, 2000, "ref"));
  }
  const planeDir = (split: string) => `${OUT}/icon-airplane-landing_AI_8/split_${split}`;
  return withDecisions(root, [
    // The bunny: two records, the same AI path, neither id matches this scan.
    record(BUNNY_STALE, `${BUNNY_DIR}/${BUNNY}`, `${BUNNY_DIR}/${BUNNY}`),
    record(pairId("moved/away", "icon-bunny-face", "_5_01"), null, `${BUNNY_DIR}/${BUNNY}`),
    // References approved in Selection while their AI image was already gone.
    record(pairId(planeDir("01"), "icon-airplane-landing", ""), `${planeDir("01")}/${PLANE}`, null),
    record(pairId(planeDir("02"), "icon-airplane-landing", ""), `${planeDir("02")}/${PLANE}`, null),
    // …plus a stale id for the same reference path (the older duplicate shape).
    record(pairId("elsewhere", "icon-airplane-landing", ""), `${planeDir("01")}/${PLANE}`, null),
  ]);
}

const kinds = (d: Discovery) => d.excluded.map((e) => e.kind);

describe("the Generate SVG source list", () => {
  it("lists the AI output once — never twice, whatever the records say", async () => {
    const found = await discoverApprovedSources(reportedRoot());
    expect(found.sources.map((s) => s.name)).toEqual([BUNNY]);
    expect(found.sources[0].relPath).toBe(`${BUNNY_DIR}/${BUNNY}`);
    expect(found.sources[0].id).toBe(BUNNY_REAL); // the pair's own stable id
    expect(found.sources[0].fingerprint).toBe("2:3100"); // the file's own size:mtime, not a record
    expect(kinds(found).filter((k) => k === "duplicate")).toHaveLength(1);
    expect(found.excluded.find((e) => e.kind === "duplicate")?.reason).toContain("duplicate record");
  });

  it("reports the second record for one path only — the first record is its approval", async () => {
    const found = await discoverApprovedSources(reportedRoot());
    const dup = found.excluded.filter((e) => e.kind === "duplicate");
    expect(dup.map((e) => e.relPath)).toEqual([`${BUNNY_DIR}/${BUNNY}`]);
    expect(dup[0].reason).toBe(`duplicate record for ${BUNNY_DIR}/${BUNNY} — the same source is already reported`);
    // the plane's stale record names the two references' files: each is the
    // approver of the pair on disk, so it is not a duplicate of anything
    expect(found.excluded.some((e) => e.relPath === `${OUT}/icon-airplane-landing_AI_8/split_01/${PLANE}` && e.kind === "duplicate")).toBe(false);
  });

  it("never lists a reference image — a name without _AI is not a generation source", async () => {
    const found = await discoverApprovedSources(reportedRoot());
    for (const s of found.sources) {
      expect(s.name).toMatch(/_AI(\.|_\d)/); // the canonical naming policy
      expect(s.relPath).not.toContain(PLANE);
    }
    // the two planes are explained as "approved, but there is no AI image"
    const missing = found.excluded.filter((e) => e.kind === "ai-missing");
    expect(missing.map((e) => e.relPath)).toEqual([
      `${OUT}/icon-airplane-landing_AI_8/split_01/${PLANE}`,
      `${OUT}/icon-airplane-landing_AI_8/split_02/${PLANE}`,
    ]);
    expect(missing[0].reason).toBe(`no AI result (icon-airplane-landing_AI.png) beside ${OUT}/icon-airplane-landing_AI_8/split_01/${PLANE}`);
  });

  it("audits the whole tree: files, AI sources, references, missing, duplicates, rows", async () => {
    const found = await discoverApprovedSources(reportedRoot());
    expect(found.audit).toEqual({
      files: 6,        // bunny.png, _v5.svg, sidecar, two references, review-decisions.json
      aiSources: 1,    // the bunny AI image (the _v5.svg is this app's artifact)
      references: 2,   // the two reference images
      missing: 2,      // the two approved references with no AI image
      duplicates: 1,   // the second record naming the bunny path
      rows: 1,
    });
    expect(auditText(found.audit)).toBe("Audit — 6 files · 1 AI source · 2 references excluded · 2 missing files · 1 duplicate removed → 1 row");
  });

  it("keeps an approved pair with no AI image out of the list, with the reason", async () => {
    const root = new FakeDir("root");
    const arch = dir(root, "architecture");
    arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "ref"));
    withDecisions(root, [record(pairId("architecture", "court", ""), "architecture/court.png", null)]);
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]);
    expect(found.excluded).toEqual([{
      id: pairId("architecture", "court", ""),
      relPath: "architecture/court.png",
      kind: "ai-missing",
      reason: "no AI result (court_AI.png) beside architecture/court.png",
    }]);
    expect(found.audit).toMatchObject({ rows: 0, references: 1, missing: 1, duplicates: 0 });
  });

  it("reports an approved record whose files are gone, and lists nothing for it", async () => {
    const root = withDecisions(new FakeDir("root"), [
      record(pairId("architecture", "court", ""), "architecture/court.png", "architecture/court_AI.png"),
    ]);
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]);
    expect(found.excluded).toEqual([{
      id: pairId("architecture", "court", ""),
      relPath: "architecture/court_AI.png",
      kind: "no-files",
      reason: "only the decision record remains for architecture/court_AI.png",
    }]);
    expect(found.audit.missing).toBe(1);
  });

  it("reports a record that names no AI result at all, even when its reference is gone", async () => {
    const root = withDecisions(new FakeDir("root"), [
      record(pairId("architecture", "court", ""), "architecture/court.png", null),
    ]);
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]);
    expect(found.excluded[0]).toMatchObject({ kind: "not-ai-output", relPath: "architecture/court.png" });
    expect(found.excluded[0].reason).toBe("architecture/court.png is a reference image, not an AI output");
  });

  it("drops an approved pair whose AI image was deleted, naming what is missing", async () => {
    const root = new FakeDir("root");
    const arch = dir(root, "architecture");
    arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "ref"));
    arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "ai"));
    const id = pairId("architecture", "court", "");
    withDecisions(root, [record(id, "architecture/court.png", "architecture/court_AI.png")]);
    await arch.removeEntry("court_AI.png");
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]);
    expect(found.excluded).toEqual([{
      id, relPath: "architecture/court.png", kind: "ai-missing",
      reason: "no AI result (court_AI.png) beside architecture/court.png",
    }]);
  });

  it("keeps two same-named AI files in different split folders, and no row for the artifact", async () => {
    const root = new FakeDir("root");
    const records: Rec[] = [];
    for (const split of ["01", "02"]) {
      const d = dir(root, `out/${split}`);
      d.children.set("icon_AI_01.png", new FakeFile("icon_AI_01.png", 20, 3100, "ai"));
      d.children.set("icon_AI_01_v2.svg", new FakeFile("icon_AI_01_v2.svg", 40, 3300, "<svg/>"));
      records.push(record(pairId(`out/${split}`, "icon", "_01"), `out/${split}/icon.png`, `out/${split}/icon_AI_01.png`));
    }
    withDecisions(root, records);
    const found = await discoverApprovedSources(root);
    expect(found.sources.map((s) => s.relPath)).toEqual(["out/01/icon_AI_01.png", "out/02/icon_AI_01.png"]);
    expect(found.audit).toEqual({ files: 5, aiSources: 2, references: 0, missing: 0, duplicates: 0, rows: 2 });
  });

  it("lets the pair's own decision win over an older record for the same path", async () => {
    const root = new FakeDir("root");
    const arch = dir(root, "architecture");
    arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "ref"));
    arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "ai"));
    const id = pairId("architecture", "court", "");
    withDecisions(root, [
      record(id, "architecture/court.png", "architecture/court_AI.png", "declined"),
      record(pairId("old", "court", ""), null, "architecture/court_AI.png"),
    ]);
    const found = await discoverApprovedSources(root);
    expect(found.sources).toEqual([]); // the decline is the newer, authoritative word
    expect(found.excluded).toEqual([]); // an existing, unapproved AI image is not an anomaly
    expect(found.audit).toMatchObject({ aiSources: 1, rows: 0 });
  });

  it("is byte-identical on a repeat scan, and maps the row to its newest version", async () => {
    const first = await discoverApprovedSources(reportedRoot());
    const again = await discoverApprovedSources(reportedRoot());
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    const row = toRow(first.sources[0], null, false);
    expect(row.newest).toBeNull();
    expect(scanKey("test_processing", first, [row])).toBe(scanKey("test_processing", again, [row]));
    // the audit and the exclusions are part of the snapshot
    expect(scanKey("test_processing", { ...first, audit: { ...first.audit, duplicates: 0 } }, [row]))
      .not.toBe(scanKey("test_processing", first, [row]));
    expect(scanKey("test_processing", { ...first, excluded: [] }, [row]))
      .not.toBe(scanKey("test_processing", first, [row]));
  });
});

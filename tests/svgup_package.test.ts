// svgup_package.test.ts — one icon's export folder (design §15/§16). The cases
// are the promises the request makes about a failing export: every format shares
// one base name, the record is written last so a reader never sees a package
// without it, a re-export replaces instead of stacking, a corrupt record is
// REPORTED while the outputs beside it stay exactly where they were, and a failure
// mid-publish leaves the previous package intact.
import { beforeEach, describe, expect, it } from "vitest";
import { EXPORT_DIR, RECORD_NAME, exportDirOf, outputRecord, packageNames, publishPackage, readPackage } from "../src/svgupload/package";
import { EXPORT_SCHEMA, type ExportRecord } from "../src/lib/svgupload/exportjson";
import type { DirHandleLike } from "../src/lib/fs";
import { probePath, writeFileOverwrite } from "../src/lib/fs";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const DIR = "run/split_04";
const BASE = "icon-trophy_AI_7_04";
const bytes = (text: string) => new TextEncoder().encode(text);

const record = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  v: EXPORT_SCHEMA,
  pair: { pairId: "p1", base: "icon-trophy_AI_7", dirPath: DIR, svgPath: `${DIR}/${BASE}_v2.svg`, version: 2, approvedAt: null, fingerprint: "10:20" },
  settings: {} as ExportRecord["settings"],
  metadata: null, tools: [], outputs: [], stages: [], status: "processed",
  fingerprints: { source: "10:20", settings: "s1", svg: "h1", jpeg: "h2" },
  validation: { ok: true, errors: [], warnings: [] }, error: null,
  createdAt: "2026-10-07T10:00:00Z", updatedAt: "2026-10-07T10:00:00Z",
  ...over,
});

/** The pair folder inside a fresh root. */
function tree(): FakeDir {
  const root = new FakeDir("test_processing_2");
  let dir = root;
  for (const name of DIR.split("/")) {
    const next = new FakeDir(name);
    dir.children.set(name, next);
    dir = next;
  }
  dir.children.set(`${BASE}_v2.svg`, new FakeFile(`${BASE}_v2.svg`, 10, 20, "<svg/>"));
  return root;
}

/** A file whose write fails — the disk-full case a rebuild must survive. */
class FailingWrite extends FakeFile {
  async createWritable(): Promise<never> {
    throw new DOMException("Disk full", "QuotaExceededError");
  }
}

/** The live export folder of the fixture tree. */
async function exportFolder(root: DirHandleLike): Promise<DirHandleLike> {
  const dir = await probePath(root, exportDirOf(DIR));
  if (dir === null) throw new Error("the export folder was not created");
  return dir;
}

/** A folder whose writes fail — the "disk went away" case a rebuild must survive. */
function deniedDir(): DirHandleLike {
  const err = () => Promise.reject(new DOMException("Denied", "NotAllowedError"));
  return {
    kind: "directory", name: "denied",
    getDirectoryHandle: err, getFileHandle: err,
    entries: async function* () { /* empty */ },
    removeEntry: err,
  } as unknown as DirHandleLike;
}

beforeEach(() => undefined);

describe("paths and names", () => {
  it("puts the export folder inside the pair folder and shares one base name", () => {
    expect(exportDirOf(DIR)).toBe(`${DIR}/${EXPORT_DIR}`);
    expect(exportDirOf("")).toBe(EXPORT_DIR);
    const names = packageNames(BASE);
    expect(names.svg).toBe(`${BASE}.svg`);
    expect(names.jpg).toBe(`${BASE}.jpg`);
    expect(names.eps).toBe(`${BASE}.eps`);
    expect(names.record).toBe(RECORD_NAME);
  });

  it("records bytes and hash for every output", () => {
    const out = outputRecord("jpg", `${BASE}.jpg`, bytes("hello"), { width: 3886, height: 3886, mp: 15.101, quality: 0.9 });
    expect(out.bytes).toBe(5);
    expect(out.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(out.mp).toBe(15.101);
  });
});

describe("publishPackage", () => {
  it("writes the requested outputs and the record, in one base name", async () => {
    const root = tree();
    const out = await publishPackage(root, {
      dirPath: DIR, base: BASE,
      svg: { name: `${BASE}.svg`, bytes: bytes("<svg/>") },
      jpg: { name: `${BASE}.jpg`, bytes: bytes("JPEGBYTES") },
      eps: null,
      record: record(),
    });
    expect(out.ok).toBe(true);
    expect(out.written).toEqual([`${BASE}.svg`, `${BASE}.jpg`, RECORD_NAME]);
    const read = await readPackage(root, DIR, BASE);
    expect(read.exists).toBe(true);
    expect(read.record?.pair.version).toBe(2);
    expect(read.present).toEqual({ svg: true, jpg: true, eps: false });
  });

  it("writes NO eps file when EPS was not requested (never a renamed artefact)", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("a") }, jpg: null, eps: null, record: record() });
    const read = await readPackage(root, DIR, BASE);
    expect(read.present.eps).toBe(false);
  });

  it("replaces its own outputs on a re-export instead of stacking files", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("one") }, jpg: null, eps: null, record: record() });
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("two") }, jpg: null, eps: null, record: record({ status: "partial" }) });
    const dir = await readPackage(root, DIR, BASE);
    expect(dir.record?.status).toBe("partial");
    const folder = await probePath(root, exportDirOf(DIR));
    expect(folder).not.toBeNull();
    const helpers = await import("../src/lib/fs");
    // exactly the outputs and the record: the staging folder does not survive
    expect((await helpers.listChildNames(folder as DirHandleLike)).sort()).toEqual([RECORD_NAME, `${BASE}.svg`].sort());
  });

  it("leaves the previous package intact when a publish fails", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("first") }, jpg: null, eps: null, record: record() });
    const before = await readPackage(root, DIR, BASE);
    const out = await publishPackage(deniedDir(), { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("second") }, jpg: null, eps: null, record: record() });
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
    const after = await readPackage(root, DIR, BASE);
    expect(after.record?.status).toBe(before.record?.status);
    expect(after.present).toEqual(before.present);
  });
});

describe("readPackage — a broken record never destroys the outputs", () => {
  it("reports a corrupt record and still lists the files that exist", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("kept") }, jpg: null, eps: null, record: record() });
    const dir = await probePath(root, exportDirOf(DIR));
    if (dir === null) throw new Error("the export folder was not created");
    await writeFileOverwrite(dir, RECORD_NAME, new Blob(["{ broken json"]));
    const read = await readPackage(root, DIR, BASE);
    expect(read.corrupt).toContain("valid JSON");
    expect(read.record).toBeNull();
    expect(read.present.svg).toBe(true); // the output survived the bad record
  });

  it("reports no package for a folder that does not exist yet", async () => {
    const read = await readPackage(tree(), DIR, BASE);
    expect(read).toEqual({ exists: false, record: null, corrupt: null, incomplete: false, present: { svg: false, jpg: false, eps: false } });
  });
});

describe("a publication that failed halfway is rolled back (R01)", () => {
  it("restores the previous files and record when a later output could not be written", async () => {
    const root = tree();
    await publishPackage(root, {
      dirPath: DIR, base: BASE,
      svg: { name: `${BASE}.svg`, bytes: bytes("first") },
      jpg: { name: `${BASE}.jpg`, bytes: bytes("old-jpeg") },
      eps: null, record: record(),
    });
    const before = await readPackage(root, DIR, BASE);
    // The live JPEG is now a file that refuses to be written: the next publish
    // replaces the SVG first and then dies on the JPEG.
    const folder = (await exportFolder(root)) as FakeDir;
    folder.children.set(`${BASE}.jpg`, new FailingWrite(`${BASE}.jpg`));
    const out = await publishPackage(root, {
      dirPath: DIR, base: BASE,
      svg: { name: `${BASE}.svg`, bytes: bytes("second") },
      jpg: { name: `${BASE}.jpg`, bytes: bytes("new-jpeg") },
      eps: null, record: record({ status: "partial" }),
    });
    expect(out.ok).toBe(false);
    const after = await readPackage(root, DIR, BASE);
    expect(after.record?.status).toBe(before.record?.status);
    expect(after.record?.updatedAt).toBe(before.record?.updatedAt);
    const svg = await (await (await probePath(root, exportDirOf(DIR)))!.getFileHandle(`${BASE}.svg`)).getFile().then((f) => f.text());
    expect(svg).toBe("first"); // the half-written SVG was put back
  });

  it("writes nothing else beside the package — no backup or staging folder survives", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("one") }, jpg: null, eps: null, record: record() });
    const folder = await exportFolder(root);
    const helpers = await import("../src/lib/fs");
    expect((await helpers.listChildNames(folder)).sort()).toEqual([RECORD_NAME, `${BASE}.svg`].sort());
  });
});

describe("an interrupted publication is reported, never trusted (R01)", () => {
  it("refuses to reuse a record whose staging folder still holds files", async () => {
    const root = tree();
    await publishPackage(root, { dirPath: DIR, base: BASE, svg: { name: `${BASE}.svg`, bytes: bytes("kept") }, jpg: null, eps: null, record: record() });
    const folder = await exportFolder(root);
    // What a crash between the file swap and the commit leaves behind:
    const stage = await folder.getDirectoryHandle(".export-staging", { create: true });
    await writeFileOverwrite(stage, `${BASE}.jpg`, new Blob(["half written"]));
    const read = await readPackage(root, DIR, BASE);
    expect(read.incomplete).toBe(true);
    expect(read.record).toBeNull(); // never "Processed" on possibly mixed bytes
    expect(read.present.svg).toBe(true); // the files are still listed, not hidden
  });
});

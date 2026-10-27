// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { newExportRecord, serializeExportRecord, type ExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildRepresentationZip } from "../src/lib/stockupload/zippack";
import { FakeDir, FakeFile, LockedFile } from "./helpers/fakefs";

function makeRecord(opts: {
  id: string;
  dir: string;
  stem: string;
  svg?: boolean;
  jpg?: boolean;
  eps?: boolean;
  committed?: boolean;
}): ExportRecord {
  const exportDir = opts.dir === "" ? "export" : `${opts.dir}/export`;
  const rec = newExportRecord({
    pair: { id: opts.id, base: opts.stem, suffix: "", dir: opts.dir },
    source: { svgPath: `${opts.dir}/${opts.stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:100" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "abc" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 100, afterBytes: 80, beforeHash: "0", afterHash: "1" },
    epsEnabled: Boolean(opts.eps),
    now: "2026-10-27T10:00:00.000Z",
  });
  if (opts.committed !== false) {
    rec.stage = "committed";
    rec.status = "processed";
    rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  }
  rec.outputs = {
    svg: opts.svg ? { path: `${exportDir}/${opts.stem}.svg`, bytes: 24, hash: "sha256:1" } : null,
    jpg: opts.jpg ? { path: `${exportDir}/${opts.stem}.jpg`, bytes: 32, hash: "sha256:2" } : null,
    eps: opts.eps ? { path: `${exportDir}/${opts.stem}.eps`, bytes: 40, hash: "sha256:3" } : null,
  };
  return rec;
}

function putPath(root: FakeDir, dirPath: string, name: string, file: FakeFile): void {
  let cur = root;
  for (const seg of dirPath.split("/").filter(Boolean)) {
    const existing = cur.children.get(seg);
    if (existing instanceof FakeDir) cur = existing;
    else {
      const next = new FakeDir(seg);
      cur.children.set(seg, next);
      cur = next;
    }
  }
  cur.children.set(name, file);
}

describe("discoverExportedItems — strict export/ + export.json rule", () => {
  it("lists only files recorded as exported in export.json inside folders named export", async () => {
    const root = new FakeDir("workspace");
    // Upstream files outside export/ must never be listed
    putPath(root, "icons/cat", "cat_AI.svg", new FakeFile("cat_AI.svg", 20, 1000, "<svg/>"));
    putPath(root, "icons/cat", "cat_AI.png", new FakeFile("cat_AI.png", 50, 1000, "png"));
    // Non-export folder even with export.json must be ignored
    const bogusRec = serializeExportRecord(makeRecord({ id: "bogus", dir: "icons/other", stem: "bogus", jpg: true }));
    putPath(root, "icons/other/output", "export.json", new FakeFile("export.json", bogusRec.length, 1000, bogusRec));
    putPath(root, "icons/other/output", "bogus.jpg", new FakeFile("bogus.jpg", 32, 1000, "jpgdata"));

    // Valid exported package inside export/ + one stray unrecorded file
    const rec = serializeExportRecord(makeRecord({ id: "pair-cat", dir: "icons/cat", stem: "cat_01", svg: true, jpg: true, eps: true }));
    putPath(root, "icons/cat/export", "export.json", new FakeFile("export.json", rec.length, 2000, rec));
    putPath(root, "icons/cat/export", "cat_01.svg", new FakeFile("cat_01.svg", 24, 2000, "<svg viewBox='0 0 10 10'/>"));
    putPath(root, "icons/cat/export", "cat_01.jpg", new FakeFile("cat_01.jpg", 32, 2000, "jpeg-bytes"));
    putPath(root, "icons/cat/export", "cat_01.eps", new FakeFile("cat_01.eps", 40, 2000, "%!PS-Adobe-3.0 EPSF-3.0"));
    putPath(root, "icons/cat/export", "stray_untracked.jpg", new FakeFile("stray_untracked.jpg", 99, 2000, "stray"));

    const found = await discoverExportedItems(root);
    expect(found.items).toHaveLength(1);
    expect(found.items[0].id).toBe("pair-cat");
    expect(found.items[0].stem).toBe("cat_01");
    expect(found.items[0].exportDir).toBe("icons/cat/export");
    expect(found.items[0].files.raster?.relPath).toBe("icons/cat/export/cat_01.jpg");
    expect(found.items[0].files.svg?.relPath).toBe("icons/cat/export/cat_01.svg");
    expect(found.items[0].files.eps?.relPath).toBe("icons/cat/export/cat_01.eps");
    expect(found.audit.unrecordedFiles).toBe(1);
  });

  it("supports picking an export folder itself as root and rebases paths safely", async () => {
    const exportRoot = new FakeDir("export");
    const rec = serializeExportRecord(makeRecord({ id: "pair-sun", dir: "nested/sun", stem: "sun_v2", jpg: true }));
    exportRoot.children.set("export.json", new FakeFile("export.json", rec.length, 3000, rec));
    exportRoot.children.set("sun_v2.jpg", new FakeFile("sun_v2.jpg", 18, 3000, "jpeg-sun"));

    const found = await discoverExportedItems(exportRoot);
    expect(found.items).toHaveLength(1);
    expect(found.items[0].exportDir).toBe("");
    expect(found.items[0].files.raster?.relPath).toBe("sun_v2.jpg");
  });

  it("reports corrupt export.json, uncommitted records, and recorded-but-missing or locked files honestly", async () => {
    const root = new FakeDir("workspace");
    putPath(root, "bad/export", "export.json", new FakeFile("export.json", 5, 1000, "{bad"));
    const uncommitted = serializeExportRecord(makeRecord({ id: "u1", dir: "draft", stem: "draft", jpg: true, committed: false }));
    putPath(root, "draft/export", "export.json", new FakeFile("export.json", uncommitted.length, 1000, uncommitted));

    const partial = serializeExportRecord(makeRecord({ id: "pair-dog", dir: "dog", stem: "dog", jpg: true, eps: true }));
    putPath(root, "dog/export", "export.json", new FakeFile("export.json", partial.length, 1000, partial));
    putPath(root, "dog/export", "dog.jpg", new FakeFile("dog.jpg", 15, 1000, "dog-jpeg"));
    // dog.eps is missing on disk!
    putPath(root, "locked/export", "export.json", new LockedFile("export.json"));

    const found = await discoverExportedItems(root);
    expect(found.corruptRecords).toEqual(["bad/export/export.json"]);
    expect(found.unreadable).toEqual(["locked/export/export.json"]);
    expect(found.audit.uncommittedRecords).toBe(1);
    expect(found.items).toHaveLength(1);
    expect(found.items[0].id).toBe("pair-dog");
    expect(found.items[0].files.raster?.fileName).toBe("dog.jpg");
    expect(found.items[0].files.eps).toBeNull();
    expect(found.items[0].missingRecorded).toEqual(["dog.eps"]);
  });

  it("packages verified exported sibling representations into <stem>.zip without export.json", async () => {
    const root = new FakeDir("workspace");
    const rec = serializeExportRecord(makeRecord({ id: "pair-fox", dir: "fox", stem: "fox_02", svg: true, jpg: true, eps: true }));
    putPath(root, "fox/export", "export.json", new FakeFile("export.json", rec.length, 2000, rec));
    putPath(root, "fox/export", "fox_02.svg", new FakeFile("fox_02.svg", 10, 2000, "<svg/>"));
    putPath(root, "fox/export", "fox_02.jpg", new FakeFile("fox_02.jpg", 10, 2000, "jpg-content"));
    putPath(root, "fox/export", "fox_02.eps", new FakeFile("fox_02.eps", 10, 2000, "eps-content"));

    const found = await discoverExportedItems(root);
    const packed = await buildRepresentationZip(root, found.items[0]);
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    expect(packed.fileName).toBe("fox_02.zip");
    expect(packed.bytes.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(packed.bytes);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["fox_02.eps", "fox_02.jpg", "fox_02.svg"]);
    expect(await zip.file("fox_02.jpg")?.async("string")).toBe("jpg-content");
  });
});

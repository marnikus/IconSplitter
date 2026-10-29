import { describe, expect, it } from "vitest";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildGettyEspCsv, GETTY_ESP_CSV_HEADER } from "../src/lib/stockupload/gettycsv";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { GETTY_IMAGES_PRESET } from "../src/lib/stockupload/presets";
import { metadataBlock, newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { metadataFingerprint, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function makeRecordMeta(meta: IconMetadata) {
  return metadataBlock(meta, {
    prompt: "",
    provider: "manual",
    model: "manual",
    requestId: null,
    usage: { input: null, output: null, total: null },
    fingerprint: metadataFingerprint(meta),
    validation: validateMetadata(meta),
  });
}

function addGettyFixture(
  root: FakeDir,
  opts: {
    id: string;
    dir: string;
    stem: string;
    rasterExt?: "jpg" | "png" | null;
    svg?: boolean;
    eps?: boolean;
    bytesOverride?: number;
    metadata?: IconMetadata | null;
    committedAt?: string;
  },
) {
  const exportDir = `${opts.dir}/export`;
  const rec = newExportRecord({
    pair: { id: opts.id, base: opts.stem, suffix: "", dir: opts.dir },
    source: { svgPath: `${opts.dir}/${opts.stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: Boolean(opts.eps),
    now: "2026-10-29T09:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = opts.committedAt ?? "2026-10-29T09:05:00.000Z";
  rec.metadata = opts.metadata ? makeRecordMeta(opts.metadata) : null;
  const sz = opts.bytesOverride ?? 128;
  rec.outputs = {
    svg: opts.svg ? { path: `${exportDir}/${opts.stem}.svg`, bytes: sz, hash: "sha256:s" } : null,
    jpg: opts.rasterExt ? { path: `${exportDir}/${opts.stem}.${opts.rasterExt}`, bytes: sz, hash: "sha256:j" } : null,
    eps: opts.eps ? { path: `${exportDir}/${opts.stem}.eps`, bytes: sz, hash: "sha256:e" } : null,
  };
  let cur = root;
  for (const seg of exportDir.split("/")) {
    const next = (cur.children.get(seg) as FakeDir | undefined) ?? new FakeDir(seg);
    cur.children.set(seg, next);
    cur = next;
  }
  const json = serializeExportRecord(rec);
  cur.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  if (opts.svg) cur.children.set(`${opts.stem}.svg`, new FakeFile(`${opts.stem}.svg`, sz, 1000, "<svg/>"));
  if (opts.rasterExt) cur.children.set(`${opts.stem}.${opts.rasterExt}`, new FakeFile(`${opts.stem}.${opts.rasterExt}`, sz, 1000, "jpgdata"));
  if (opts.eps) cur.children.set(`${opts.stem}.eps`, new FakeFile(`${opts.stem}.eps`, sz, 1000, "%!PS-Adobe-3.0\n"));
}

const VALID_META: IconMetadata = {
  title: "Minimal Rocket Launch Vector Icon",
  description: "Clean geometric rocket launch symbol on crisp light background",
  tags: ["icon", "vector", "rocket", "launch", "startup", "space", "symbol"],
};

describe("Getty Images / iStock preflight rules & ESP CSV metadata builder", () => {
  it("passes cleanly without Getty warnings when paired EPS + RGB JPG and 5-50 keywords + title/description exist", async () => {
    const root = new FakeDir("ws");
    addGettyFixture(root, {
      id: "icon-ok", dir: "ok", stem: "rocket_01", rasterExt: "jpg", eps: true, metadata: VALID_META,
    });
    const found = await discoverExportedItems(root);
    const plan = buildStockUploadPlan({
      items: found.items,
      checkedIds: ["icon-ok"],
      presets: [GETTY_IMAGES_PRESET],
      checkedTargets: ["getty-images"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    });
    expect(plan.preflightErrors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.tasks.map((t) => t.fileName)).toEqual(["rocket_01.jpg", "rocket_01.eps"]);
  });

  it("warns on SVG/ZIP formats, standalone EPS without matching JPG preview, >50 MB files, and missing/excess metadata", async () => {
    const root = new FakeDir("ws");
    addGettyFixture(root, {
      id: "icon-bad",
      dir: "bad",
      stem: "lone_vec",
      rasterExt: "png",
      svg: true,
      eps: true,
      bytesOverride: 52 * 1024 * 1024,
      metadata: {
        ...VALID_META,
        description: "",
        tags: Array.from({ length: 55 }, (_, i) => `kw${i + 1}`),
      },
    });
    const found = await discoverExportedItems(root);
    const oversizedItem = {
      ...found.items[0],
      files: {
        ...found.items[0].files,
        eps: { ...found.items[0].files.eps!, bytes: 52 * 1024 * 1024 },
      },
    };
    const plan = buildStockUploadPlan({
      items: [oversizedItem],
      checkedIds: ["icon-bad"],
      presets: [GETTY_IMAGES_PRESET],
      checkedTargets: ["getty-images"],
      formats: { raster: false, svg: true, eps: true, zip: true },
    });

    expect(plan.warnings.some((w) => w.includes("Getty Images") && w.includes("SVG") && w.includes("ZIP"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Getty Images") && w.includes("EPS") && w.includes("JPG"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Getty Images") && w.includes("50 MB"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Getty Images") && w.includes("50 keywords"))).toBe(true);
  });

  it("builds RFC-4180 Getty ESP / DeepMeta CSV with exact header columns, EPS/JPG filename pairing, YYYY-MM-DD date, and <=50 keywords", async () => {
    const root = new FakeDir("ws");
    addGettyFixture(root, {
      id: "icon-vec",
      dir: "v",
      stem: "compass_01",
      rasterExt: "jpg",
      eps: true,
      committedAt: "2026-10-29T11:30:00.000Z",
      metadata: {
        ...VALID_META,
        title: 'Compass, "North" Direction',
        description: "Navigation compass symbol for travel maps",
        tags: Array.from({ length: 53 }, (_, i) => `term${i + 1}`),
      },
    });
    addGettyFixture(root, {
      id: "icon-jpg",
      dir: "j",
      stem: "photo_02",
      rasterExt: "jpg",
      eps: false,
      committedAt: "2026-10-28T08:15:00.000Z",
      metadata: VALID_META,
    });
    const found = await discoverExportedItems(root);
    const csv = buildGettyEspCsv(found.items, { country: "Czech Republic", briefCode: "BR-77" });
    const lines = csv.trim().split(/\r?\n/);

    expect(GETTY_ESP_CSV_HEADER).toBe("file name,created date,title,description,country,brief code,keywords");
    expect(lines[0]).toBe("file name,created date,title,description,country,brief code,keywords");
    expect(lines).toHaveLength(3);

    const vecLine = lines.find((l) => l.startsWith("compass_01.eps,"))!;
    expect(vecLine).toContain(",2026-10-29,");
    expect(vecLine).toContain('"Compass, ""North"" Direction"');
    expect(vecLine).toContain(",Czech Republic,BR-77,");
    expect(vecLine).toContain("term50");
    expect(vecLine).not.toContain("term51");

    const jpgLine = lines.find((l) => l.startsWith("photo_02.jpg,"))!;
    expect(jpgLine).toContain(",2026-10-28,");
  });
});

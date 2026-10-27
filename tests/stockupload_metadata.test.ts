import { describe, expect, it } from "vitest";
import { refreshStockMetadata } from "../src/lib/stockupload/metadata";
import { scanStockExports } from "../src/lib/stockupload/discovery";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { STOCK_TEST_META } from "./helpers/stockexport";
import { sha256Hex } from "../src/lib/upload/hash";
import { cleanMetadata } from "../src/lib/upload/meta";
import { readXmpMetadata } from "../src/lib/upload/jpeg";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";

async function packageFixture() {
  const root = new BinDir("root"), dir = new BinDir("export"); root.children.set("export", dir);
  const media: Record<string, Uint8Array> = { jpg: minimalJpeg(2400, 2400), svg: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 2400"><path d="M0 0L10 10"/></svg>'), eps: new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%LanguageLevel: 3\n%%BoundingBox: 0 0 2400 2400\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n") };
  const outputs: Record<string, unknown> = {};
  for (const [kind, bytes] of Object.entries(media)) {
    outputs[kind] = { path: `original/export/icon.${kind}`, bytes: bytes.length, hash: `sha256:${await sha256Hex(bytes)}` };
    dir.children.set(`icon.${kind}`, new BinFile(`icon.${kind}`, bytes));
  }
  const raw = { v: 1, pair: { id: "stock-pair" }, stage: "committed", status: "processed", outputs, validation: { svg: true, jpeg: true, eps: true, json: true, readback: true }, timestamps: { committedAt: new Date().toISOString() }, metadata: STOCK_TEST_META };
  dir.children.set("export.json", new BinFile("export.json", JSON.stringify(raw)));
  return { root, dir, media };
}
describe("metadata refresh uses exported bytes, not source/rerender", () => {
  it("reads real sha256:-prefixed declarations and refreshes all metadata carriers JSON-last", async () => {
    const { root, dir, media } = await packageFixture();
    const inventory = await scanStockExports(root); expect(inventory.rows).toHaveLength(1);
    const meta = cleanMetadata({ ...STOCK_TEST_META, tags: [...STOCK_TEST_META.tags, "design", "website"], title: "Updated waving flag design for web", creator: "Local creator", copyright: "© Local creator" });
    await refreshStockMetadata(root, inventory.rows[0], meta);
    const jpg = new Uint8Array(await (await (await dir.getFileHandle("icon.jpg")).getFile()).arrayBuffer());
    expect(readXmpMetadata(jpg)).toEqual(meta); expect(readJpegIptc(jpg)).toEqual(meta);
    const svg = await (await (await dir.getFileHandle("icon.svg")).getFile()).text();
    expect(readEmbeddedMetadata(svg)).toEqual(meta);
    expect(readXmpMetadataFromEps(await (await (await dir.getFileHandle("icon.eps")).getFile()).text())).toEqual(meta);
    expect((await scanStockExports(root)).rows[0].metadata).toEqual(meta);
    expect(media.jpg).toEqual(minimalJpeg(2400, 2400));
    expect([...dir.children.keys()].sort()).toEqual(["export.json", "icon.eps", "icon.jpg", "icon.svg"]);
  });
  it("refuses invalid metadata or a record changed since discovery", async () => {
    const { root, dir } = await packageFixture(), row = (await scanStockExports(root)).rows[0];
    await expect(refreshStockMetadata(root, row, { title: "", description: "", tags: [] })).rejects.toThrow();
    dir.children.set("export.json", new BinFile("export.json", "{}"));
    await expect(refreshStockMetadata(root, row, { ...STOCK_TEST_META, tags: [...STOCK_TEST_META.tags, "design", "website"] })).rejects.toThrow(/changed/);
  });
});

it("rolls back earlier metadata edits if a later exported file write fails", async () => {
  const { root, dir, media } = await packageFixture(), row = (await scanStockExports(root)).rows[0];
  const eps = await dir.getFileHandle("icon.eps"), original = eps.createWritable.bind(eps); let fail = true;
  eps.createWritable = async () => { if (fail) { fail = false; throw new Error("disk failure"); } return original(); };
  await expect(refreshStockMetadata(root, row, { ...STOCK_TEST_META, tags: [...STOCK_TEST_META.tags, "design", "website"] })).rejects.toThrow(/disk failure/);
  const back = new Uint8Array(await (await (await dir.getFileHandle("icon.jpg")).getFile()).arrayBuffer());
  expect(back).toEqual(media.jpg); expect((await scanStockExports(root)).rows).toHaveLength(1);
});

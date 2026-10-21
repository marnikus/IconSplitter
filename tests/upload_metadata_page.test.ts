import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { mountReader } from "./assets/SVG to JPEG or EPS export tests/page.mjs";
import { readStockFile } from "./assets/SVG to JPEG or EPS export tests/reader.mjs";
import { runExport } from "../src/upload/runexport";
import { readBytesAt } from "../src/lib/fs";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { stockExportArgs, STOCK_TEST_META, STOCK_TEST_SVGS } from "./helpers/stockexport";

const fixtureDir = resolve("tests/assets/SVG to JPEG or EPS export tests");
const html = () => readFileSync(`${fixtureDir}/index.html`, "utf8");
let dispose = () => {};
afterEach(() => { dispose(); document.body.replaceChildren(); });
function mount() { document.body.innerHTML = html(); dispose = mountReader(document); }
function upload(files: File[]) {
  const input = document.querySelector("input")!;
  Object.defineProperty(input, "files", { configurable: true, value: files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function testExportAndUpload(svg: string) {
  const { args, root } = stockExportArgs(svg);
  const result = await runExport(args);
  expect(result.status, JSON.stringify(result.error)).toBe("processed");
  const jpg = await readBytesAt(root, "export/temporary.jpg") as Uint8Array;
  const eps = await readBytesAt(root, "export/temporary.eps") as Uint8Array;
  expect(verifyEpsDocument(new TextDecoder().decode(eps)).ok).toBe(true);
  for (const bytes of [jpg, eps]) {
    const read = readStockFile(bytes);
    expect(read.metadata).toEqual(STOCK_TEST_META);
    expect(read.iptc).toEqual(STOCK_TEST_META);
    expect(read.carriers).toEqual(["XMP", "IPTC-IIM"]);
  }
  mount();
  upload([new File([jpg as BlobPart], "exported.jpg"), new File([eps as BlobPart], "exported.eps")]);
  await vi.waitFor(() => expect(document.querySelectorAll('[data-state="ready"]')).toHaveLength(2));
  for (const card of document.querySelectorAll("article")) {
    expect(card.querySelector('[data-field="title"]')?.textContent).toBe(STOCK_TEST_META.title);
    expect(card.querySelector('[data-field="description"]')?.textContent).toBe(STOCK_TEST_META.description);
    expect(Array.from(card.querySelector('[data-field="tags"]')!.querySelectorAll("li"), (el) => el.textContent)).toEqual(STOCK_TEST_META.tags);
    expect(card.querySelector("safe")).toBeNull();
  }
}

describe("independent file upload webpage", () => {
  it.each(STOCK_TEST_SVGS)("reads actual committed JPEG/EPS from supplementary SVG fixture: %s", testExportAndUpload);
  it("replaces old metadata with an explicit error on unsupported/malformed files", async () => {
    await testExportAndUpload(STOCK_TEST_SVGS[0]);
    upload([new File(["not a jpeg"], "bad.jpg")]);
    await vi.waitFor(() => expect(document.querySelector('[data-state="error"]')).not.toBeNull());
    expect(document.querySelector('[data-field="title"]')).toBeNull();
    expect(document.body.textContent).not.toContain(STOCK_TEST_META.title);
    expect(() => readStockFile(new Uint8Array([255, 216, 255, 225, 0, 1]))).toThrow();
  });
  it("never imports production metadata code or accesses the network", () => {
    for (const name of ["reader.mjs", "page.mjs"]) {
      const source = readFileSync(`${fixtureDir}/${name}`, "utf8");
      expect(source).not.toMatch(/(?:src\/|fetch\(|XMLHttpRequest|innerHTML|eval\()/);
    }
  });
});

const supplied = readdirSync(fixtureDir).filter((n) => n.toLowerCase().endsWith(".svg"));
describe.skipIf(supplied.length === 0)("user-supplied SVG export acceptance (files currently absent)", () => {
  it("has exactly the two requested source SVGs", () => expect(supplied).toHaveLength(2));
  it.each(supplied)("exports and uploads %s as JPEG AND EPS", async (name) => {
    await testExportAndUpload(readFileSync(`${fixtureDir}/${name}`, "utf8"));
  });
});

it("shows full XMP fields with long UTF-8 text and separately exposes limited legacy fields", async () => {
  const { args, root } = stockExportArgs(STOCK_TEST_SVGS[0]);
  const metadata = { title: "日本語".repeat(100), description: "é".repeat(1500), tags: ["🌈".repeat(30)] };
  const result = await runExport({ ...args, metadata });
  expect(result.status).toBe("processed");
  for (const ext of ["jpg", "eps"]) {
    const read = readStockFile(await readBytesAt(root, `export/temporary.${ext}`) as Uint8Array);
    expect(read.metadata).toEqual(metadata);
    expect(read.iptc?.title.length).toBeLessThan(metadata.title.length);
  }
});

it("handles IPTC-only and XMP-only files without inventing a second metadata carrier", async () => {
  const { args, root } = stockExportArgs(STOCK_TEST_SVGS[0]);
  await runExport(args);
  const eps = new TextDecoder().decode(await readBytesAt(root, "export/temporary.eps") as Uint8Array);
  const iptcOnly = eps.replace(/<\?xpacket begin=[\s\S]*?<\?xpacket end=[^?]*\?>/, "");
  expect(readStockFile(new TextEncoder().encode(iptcOnly)).carriers).toEqual(["IPTC-IIM"]);
  const xmpOnly = eps.replace(/^% IconSplitter IPTC begin\n[\s\S]*?^% IconSplitter IPTC end\n/m, "");
  expect(readStockFile(new TextEncoder().encode(xmpOnly)).carriers).toEqual(["XMP"]);
  expect(() => readStockFile(new TextEncoder().encode(iptcOnly.replace(/^%%BeginPhotoshop:[\s\S]*?^%%EndPhotoshop/m, "")))).toThrow(/No complete/);
});

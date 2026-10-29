import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readBytesAt, readTextAt } from "../src/lib/fs";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { ADOBE_STOCK_PRESET, GETTY_IMAGES_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";
import { metadataBlock, newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { readXmpMetadata } from "../src/lib/upload/jpeg";
import { metadataFingerprint, type IconMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const meta: IconMetadata = { title: "Determination of a specific singular point", description: "Identifying a precise focal coordinate within a wider context of discovery", tags: ["icon", "line"], creator: "Artist" };
const joined = `${meta.title}. ${meta.description}`;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>';
const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 20 20\n%%EndComments\nshowpage\n%%EOF\n";

async function fixture() {
  const root = new FakeDir("ws"); const dir = new FakeDir("export"); root.children.set("export", dir);
  const rec = newExportRecord({ pair: { id: "one", base: "icon", suffix: "", dir: "" }, source: { svgPath: "icon.svg", version: 1, approval: "approved", fingerprint: "x" }, settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "x" }, svgo: { enabled: true, version: "3", config: "default", beforeBytes: 1, afterBytes: 1, beforeHash: "0", afterHash: "0" }, epsEnabled: true, now: "2026-10-29T10:00:00Z" });
  rec.stage = "committed"; rec.status = "processed"; rec.timestamps.committedAt = "2026-10-29T10:00:00Z";
  rec.metadata = metadataBlock(meta, { prompt: "", provider: "local", model: "manual", requestId: null, usage: { input: null, output: null, total: null }, fingerprint: metadataFingerprint(meta), validation: { ok: true, errors: [], warnings: [] } });
  rec.outputs = { jpg: { path: "export/icon.jpg", bytes: jpeg.length, hash: "x" }, svg: { path: "export/icon.svg", bytes: svg.length, hash: "x" }, eps: { path: "export/icon.eps", bytes: eps.length, hash: "x" } };
  const json = serializeExportRecord(rec); dir.children.set("export.json", new FakeFile("export.json", json.length, 1, json));
  const file = new FakeFile("icon.jpg", jpeg.length, 1); file.data = new Blob([jpeg as BlobPart]); dir.children.set("icon.jpg", file);
  dir.children.set("icon.svg", new FakeFile("icon.svg", svg.length, 1, svg)); dir.children.set("icon.eps", new FakeFile("icon.eps", eps.length, 1, eps));
  return { root, json, item: (await discoverExportedItems(root)).items[0] };
}

async function run(enabled: boolean, target = SHUTTERSTOCK_PRESET, zip = false) {
  const { root, json, item } = await fixture();
  const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [target], checkedTargets: [target.id], formats: { raster: !zip, svg: !zip && target.protocol !== "esp-https", eps: !zip, zip }, combineTitleDescription: enabled });
  const sent: Array<{ fileName: string; bytes: Uint8Array; pairedFile?: { fileName: string; bytes: Uint8Array } }> = [];
  const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async (input) => { sent.push(input); return { ok: true, bytes: input.bytes.length }; } });
  return { root, json, sent, result };
}

describe("upload-only title and description combination", () => {
  it("embeds the combined title in JPG, SVG, EPS and leaves original files and export.json unchanged", async () => {
    const { root, json, sent, result } = await run(true);
    expect(result.failedFiles).toBe(0); expect(sent).toHaveLength(3);
    const jpg = sent.find((f) => f.fileName.endsWith(".jpg"))!;
    const vector = sent.find((f) => f.fileName.endsWith(".svg"))!;
    const postscript = sent.find((f) => f.fileName.endsWith(".eps"))!;
    expect(readXmpMetadata(jpg.bytes)).toMatchObject({ ...meta, title: joined, description: joined });
    expect(readEmbeddedMetadata(new TextDecoder().decode(vector.bytes))).toMatchObject({ ...meta, title: joined, description: joined });
    expect(readXmpMetadataFromEps(new TextDecoder().decode(postscript.bytes))).toMatchObject({ ...meta, title: joined, description: joined });
    expect(await readBytesAt(root, "export/icon.jpg")).toEqual(jpeg);
    expect(await readTextAt(root, "export/icon.svg")).toBe(svg);
    expect(await readTextAt(root, "export/icon.eps")).toBe(eps);
    expect(await readTextAt(root, "export/export.json")).toBe(json);
  });
  it("keeps bytes unchanged when disabled", async () => {
    const { sent } = await run(false);
    expect(sent.find((f) => f.fileName.endsWith(".jpg"))?.bytes).toEqual(jpeg);
    expect(new TextDecoder().decode(sent.find((f) => f.fileName.endsWith(".svg"))?.bytes)).toBe(svg);
  });
  it("transforms both files of an ESP pair and representations inside ZIP", async () => {
    const esp = await run(true, GETTY_IMAGES_PRESET);
    expect(esp.sent).toHaveLength(1);
    expect(readXmpMetadata(esp.sent[0].bytes)?.title).toBe(joined);
    expect(readXmpMetadataFromEps(new TextDecoder().decode(esp.sent[0].pairedFile?.bytes))?.title).toBe(joined);
    const archived = await run(true, SHUTTERSTOCK_PRESET, true);
    const zip = await JSZip.loadAsync(archived.sent[0].bytes);
    expect(readXmpMetadata(await zip.file("icon.jpg")!.async("uint8array"))?.title).toBe(joined);
    expect(readEmbeddedMetadata(await zip.file("icon.svg")!.async("string"))?.title).toBe(joined);
    expect(readXmpMetadataFromEps(await zip.file("icon.eps")!.async("string"))?.title).toBe(joined);
  });
});

describe("combined upload metadata edge cases", () => {
  it("sends the full single-line title in Shutterstock caption fields while retaining Adobe description", async () => {
    const { root, json, item } = await fixture();
    const title = "Location pinpointing on a foldable paper navigation map";
    const description = "Finding a specific point of interest. Map and pin show location";
    const expected = `${title}. ${description}`;
    item.record.metadata!.title = title; item.record.metadata!.description = description;
    const targets = [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET];
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: targets, checkedTargets: targets.map((t) => t.id), formats: { raster: true, svg: false, eps: true, zip: false }, combineTitleDescription: true });
    const outgoing: Record<string, Record<string, Uint8Array>> = {};
    const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async (input) => { (outgoing[input.preset.id] ??= {})[input.fileName] = input.bytes; return { ok: true, bytes: input.bytes.length }; } });
    expect(result.failedFiles).toBe(0);
    for (const target of targets) {
      const files = outgoing[target.id];
      const jpgXmp = readXmpMetadata(files["icon.jpg"]);
      const jpgIptc = readJpegIptc(files["icon.jpg"]);
      const epsText = new TextDecoder().decode(files["icon.eps"]);
      const epsXmp = readXmpMetadataFromEps(epsText);
      const epsIptc = readEpsIptc(epsText);
      for (const value of [jpgXmp, jpgIptc, epsXmp, epsIptc]) {
        expect(value?.title).toBe(expected);
        expect(value?.description).toBe(target.id === "shutterstock" ? expected : description);
      }
    }
    expect(await readTextAt(root, "export/export.json")).toBe(json);
    expect(await readBytesAt(root, "export/icon.jpg")).toEqual(jpeg);
    expect(await readTextAt(root, "export/icon.eps")).toBe(eps);
  });
  it("uses the Shutterstock caption for a custom preset pointing to Shutterstock's FTPS host", async () => {
    const { root, item } = await fixture();
    const target = { ...SHUTTERSTOCK_PRESET, id: "custom-stock", template: "custom" as const, host: "FTPS.SHUTTERSTOCK.COM" };
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [target], checkedTargets: [target.id], formats: { raster: true, svg: false, eps: false, zip: false }, combineTitleDescription: true });
    let actual = "";
    const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async (input) => { actual = readJpegIptc(input.bytes)?.description ?? ""; return { ok: true, bytes: input.bytes.length }; } });
    expect(result.failedFiles).toBe(0); expect(actual).toBe(joined);
  });
  it("normalizes line separators and controls in both parts before combining", async () => {
    const { combinedTitle } = await import("../src/lib/stockupload/sendmeta");
    expect(combinedTitle("  Location\r\npinpointing\t on\u2028a map. ", " Finding\u0000a specific\u2029 point ")).toBe("Location pinpointing on a map. Finding a specific point");
  });
  it("sends a normalized single-line Shutterstock caption even with controls in accepted text", async () => {
    const { root, item } = await fixture();
    item.record.metadata!.title = "Location\r\npinpointing on a map.";
    item.record.metadata!.description = "Finding\u0000a point\u2028of interest";
    const expected = "Location pinpointing on a map. Finding a point of interest";
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [SHUTTERSTOCK_PRESET], checkedTargets: ["shutterstock"], formats: { raster: true, svg: false, eps: false, zip: true }, combineTitleDescription: true });
    const sent: Record<string, Uint8Array> = {};
    const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async (input) => { sent[input.fileName] = input.bytes; return { ok: true, bytes: input.bytes.length }; } });
    expect(result.failedFiles).toBe(0);
    const archived = await JSZip.loadAsync(sent["icon.zip"]);
    for (const bytes of [sent["icon.jpg"], await archived.file("icon.jpg")!.async("uint8array")]) {
      expect(readJpegIptc(bytes)).toMatchObject({ title: expected, description: expected });
      expect(readXmpMetadata(bytes)).toMatchObject({ title: expected, description: expected });
    }
    expect(item.record.metadata!.title).toContain("\r\n");
    expect(item.record.metadata!.description).toContain("\u0000");
  });
  it("never silently truncates Shutterstock's caption", async () => {
    const { root, item } = await fixture();
    item.record.metadata!.description = "a".repeat(2001);
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [SHUTTERSTOCK_PRESET], checkedTargets: ["shutterstock"], formats: { raster: true, svg: false, eps: false, zip: false }, combineTitleDescription: true });
    let uploads = 0;
    const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async () => { uploads++; return { ok: true, bytes: 0 }; } });
    expect(uploads).toBe(0); expect(result.failedFiles).toBe(1); expect(result.lastError).toMatch(/caption.*2000/i);
  });
  it("uses one separator and handles whitespace or missing parts without adding stray dots", async () => {
    const { combinedTitle } = await import("../src/lib/stockupload/sendmeta");
    expect(combinedTitle("  Title. ", "  Description  ")).toBe("Title. Description");
    expect(combinedTitle("", "Description")).toBe("Description");
    expect(combinedTitle("Title", "")).toBe("Title");
  });
  it("embeds PNG XMP in an in-memory copy and replaces old XMP on a second pass", async () => {
    const { prepareMetadataCopy } = await import("../src/lib/stockupload/sendmeta");
    const { readXmpPacket } = await import("../src/lib/upload/xmp");
    const { item } = await fixture();
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
    const original = png.slice();
    const updated = await prepareMetadataCopy(item, "icon.png", png);
    const again = await prepareMetadataCopy(item, "icon.png", updated);
    const text = new TextDecoder().decode(again);
    expect(text.match(/XML:com\.adobe\.xmp/g)).toHaveLength(1);
    const packet = text.slice(text.indexOf("<?xpacket begin="), text.indexOf('<?xpacket end="w"?>') + '<?xpacket end="w"?>'.length);
    expect(readXmpPacket(packet)).toMatchObject({ ...meta, title: joined });
    expect(png).toEqual(original);
  });
  it("updates recognized files inside an existing ZIP and leaves other entries and the source ZIP unchanged", async () => {
    const { root, item } = await fixture();
    const originalZip = new JSZip();
    originalZip.file("nested/icon.svg", svg); originalZip.file("notes.txt", "keep me");
    const bytes = await originalZip.generateAsync({ type: "uint8array" });
    const file = new FakeFile("icon.zip", bytes.length, 1); file.data = new Blob([bytes as BlobPart]);
    (root.children.get("export") as FakeDir).children.set("icon.zip", file);
    item.files.zip = { relPath: "export/icon.zip", fileName: "icon.zip", bytes: bytes.length, mtime: 1, ext: "zip" };
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [SHUTTERSTOCK_PRESET], checkedTargets: ["shutterstock"], formats: { raster: false, svg: false, eps: false, zip: true }, combineTitleDescription: true });
    let sent: Uint8Array = new Uint8Array();
    const result = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async (input) => { sent = input.bytes; return { ok: true, bytes: sent.length }; } });
    expect(result.failedFiles).toBe(0);
    const uploaded = await JSZip.loadAsync(sent);
    expect(readEmbeddedMetadata(await uploaded.file("nested/icon.svg")!.async("string"))?.title).toBe(joined);
    expect(await uploaded.file("notes.txt")!.async("string")).toBe("keep me");
    expect(await readBytesAt(root, "export/icon.zip")).toEqual(bytes);
  });
  it("fails rather than sending original bytes when metadata or carrier is missing or malformed", async () => {
    const { root, item } = await fixture();
    item.record.metadata = null;
    const plan = buildStockUploadPlan({ items: [item], checkedIds: ["one"], presets: [SHUTTERSTOCK_PRESET], checkedTargets: ["shutterstock"], formats: { raster: true, svg: false, eps: false, zip: false }, combineTitleDescription: true });
    let uploads = 0;
    const res = await executeStockUploadBatch(plan, { root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => ({ username: "u", password: "p" }), closeSessionFn: async () => undefined, uploadFn: async () => { uploads++; return { ok: true, bytes: 4 }; } });
    expect(uploads).toBe(0); expect(res.failedFiles).toBe(1); expect(res.lastError).toContain("title and description");
    const { prepareMetadataCopy } = await import("../src/lib/stockupload/sendmeta");
    const valid = (await fixture()).item;
    await expect(prepareMetadataCopy(valid, "bad.png", new Uint8Array([1, 2, 3]))).rejects.toThrow(/PNG/);
    await expect(prepareMetadataCopy(valid, "bad.eps", new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildXmpPacket, embedXmpMetadata, readXmpMetadata, verifyJpeg } from "../src/lib/upload/jpeg";
import { jpegSegments } from "../src/lib/upload/jpegmarkers";
import { photoshopResources } from "../src/lib/upload/photoshop";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { embedXmpMetadataInEps, readXmpMetadataFromEps, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { readXmpPacket } from "../src/lib/upload/xmp";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../src/lib/upload/embed";
import { cleanMetadata, metadataFingerprint } from "../src/lib/upload/meta";
import { parseMetaCache } from "../src/upload/metacache";
import { metaFromRecord } from "../src/upload/rowmodel";
import { runExport } from "../src/upload/runexport";
import { parseExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { readBytesAt } from "../src/lib/fs";
import UploadMetaFields from "../src/upload/UploadMetaFields";
import { EMPTY_META } from "../src/upload/types";
import { minimalJpeg } from "./helpers/minijpeg";
import { stockExportArgs, STOCK_TEST_META } from "./helpers/stockexport";
const BASE = "tests/assets/SVG to JPEG or EPS export tests/";
const META = { ...STOCK_TEST_META, creator: "Test author café", copyright: "© 2026 Test author & studio" };
function epsResources(eps: string) {
  const block = eps.match(/^%%BeginPhotoshop:[^\n]*\n([\s\S]*?)^%%EndPhotoshop/m)![1];
  const hex = block.replace(/^%\s*/gm, "").replace(/\s/g, "");
  return photoshopResources(Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16)));
}

describe("explicit XMP + IPTC protocol contract in BOTH file formats", () => {
  it("uses JPEG FFE1 with exact NUL-terminated XMP ID and FFED Photoshop resource0404", () => {
    const bytes = embedXmpMetadata(minimalJpeg(100, 100), META);
    const segments = jpegSegments(bytes);
    const app1 = segments.find((s) => s.marker === 0xe1)!;
    expect(Array.from(bytes.slice(app1.start, app1.start + 2))).toEqual([255, 225]);
    expect(new TextDecoder().decode(app1.data.slice(0, 29))).toBe("http://ns.adobe.com/xap/1.0/\0");
    const app13 = segments.find((s) => s.marker === 0xed)!;
    expect(Array.from(bytes.slice(app13.start, app13.start + 2))).toEqual([255, 237]);
    expect(new TextDecoder().decode(app13.data.slice(0, 14))).toBe("Photoshop 3.0\0");
    expect(photoshopResources(app13.data.slice(14)).map((r) => r.id)).toContain(0x0404);
    expect(readXmpMetadata(bytes)).toEqual(META);
    expect(readJpegIptc(bytes)).toEqual(META);
    expect(verifyJpeg(bytes, { width: 100, height: 100, metadata: META }).ok).toBe(true);
  });
  it("EPS embeds BOTH IIM0404 and XMP0424 resources, plus document-level XMP, with NO JPEG markers", () => {
    const original = readFileSync(`${BASE}icon-handshake-heart_7_01_v2.eps`, "utf8");
    const eps = embedXmpMetadataInEps(original, META);
    const resources = epsResources(eps);
    expect(resources.map((r) => r.id)).toEqual([0x0404, 0x0424]);
    expect(readXmpPacket(new TextDecoder().decode(resources[1].data))).toEqual(META);
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    expect(readEpsIptc(eps)).toEqual(META);
    expect(verifyEpsMetadata(eps, META)).toBe(true);
    expect(verifyEpsDocument(eps).ok).toBe(true);
    expect(eps).not.toContain("Photoshop 3.0\0");
    expect(embedXmpMetadataInEps(eps, META)).toBe(eps);
  });
  it("writes creator Seq and copyright Alt, never invents optional identity fields", () => {
    const packet = buildXmpPacket(META);
    expect(packet).toContain("<dc:creator><rdf:Seq>");
    expect(packet).toContain("<dc:rights><rdf:Alt>");
    expect(readXmpPacket(packet)).toEqual(META);
    expect(buildXmpPacket(STOCK_TEST_META)).not.toContain("<dc:creator>");
    expect(readXmpPacket(buildXmpPacket(STOCK_TEST_META))).toEqual(STOCK_TEST_META);
    expect(cleanMetadata({ ...META, creator: "  Test author café  " }).creator).toBe(META.creator);
  });
  it("SVG keeps optional rights and never mistakes the creator list for keyword tags", () => {
    const svg = readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, "utf8");
    const out = embedMetadataInSvg(svg, META);
    expect(readEmbeddedMetadata(out)).toEqual(META);
    expect(readEmbeddedMetadata(out)?.tags).not.toContain(META.creator);
  });
  it("fingerprints optional fields, trims identity and preserves the old no-rights identity", () => {
    expect(metadataFingerprint(META)).not.toBe(metadataFingerprint(STOCK_TEST_META));
    expect(metadataFingerprint({ ...META, copyright: "Different owner" })).not.toBe(metadataFingerprint(META));
    expect(metadataFingerprint({ ...STOCK_TEST_META, creator: "", copyright: " " })).toBe(metadataFingerprint(STOCK_TEST_META));
    expect(parseMetaCache({ v: 1, cache: { hash: { state: "accepted", meta: META } } }).hash.meta).toEqual(META);
  });
  it("real supplied SVG exports all five fields to JPEG AND EPS, persists/reloads, and re-embeds identity edits", async () => {
    const { args, root, renders } = stockExportArgs(readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, "utf8"));
    const first = await runExport({ ...args, metadata: META });
    expect(first.status).toBe("processed");
    expect(metaFromRecord(parseExportRecord(JSON.parse(serializeExportRecord(first.record!))), false).metadata).toEqual(META);
    expect(readJpegIptc(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toEqual(META);
    const eps = new TextDecoder().decode(await readBytesAt(root, "export/temporary.eps") as Uint8Array);
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    const edited = { ...META, creator: "Updated author" };
    const second = await runExport({ ...args, record: first.record, metadata: edited });
    expect(second.stages).toContain("embed");
    expect(second.stages).not.toContain("render");
    expect(renders.count).toBe(1);
    expect(readXmpMetadata(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toEqual(edited);
    const third = await runExport({ ...args, record: second.record, metadata: STOCK_TEST_META });
    expect(third.stages).toContain("embed");
    expect(readJpegIptc(await readBytesAt(root, "export/temporary.jpg") as Uint8Array)).toEqual(STOCK_TEST_META);
  });
});
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; document.body.replaceChildren(); });
it("offers explicit optional Creator/Copyright edits; identity is never generated or inferred", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const onEdit = vi.fn();
  await act(() => root!.render(<UploadMetaFields id="test" meta={{ ...EMPTY_META, state: "generated", metadata: STOCK_TEST_META }} onEdit={onEdit} onAccept={() => {}} onCopy={() => {}} onRegenerate={() => {}} />));
  for (const [field, value] of [["creator", META.creator], ["copyright", META.copyright]]) {
    const input = host.querySelector(`[data-testid="upload-meta-${field}-test"]`) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("");
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(onEdit).toHaveBeenCalledWith({ [field]: value });
  }
});

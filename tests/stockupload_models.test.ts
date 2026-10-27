import { describe, expect, it } from "vitest";
import { parseStockPreferences, readFormats } from "../src/lib/stockupload/preferences";
import { readDestinations } from "../src/lib/stockupload/destinations";
import { safeMediaName } from "../src/lib/stockupload/safety";
import { validManifest } from "../src/lib/stockupload/protocol";
import { checkStockMedia } from "../src/lib/stockupload/preflight";
import { minimalJpeg } from "./helpers/minijpeg";
import type { StockArtifact } from "../src/lib/stockupload/types";
const artifact = (kind: StockArtifact["kind"]): StockArtifact => ({ kind, path: `export/a.${kind}`, name: `a.${kind}`, bytes: 3, hash: "a".repeat(64) });
const manifest = () => ({ v: 1, job: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb", account: "shutterstock", epsReviewed: false, files: [{ id: "id", name: "a.jpg", kind: "jpg", bytes: 3, hash: "a".repeat(64) }] });
describe("stock settings are closed local non-secret data", () => {
  it("normalizes formats, zoom, preset names and only installed stock descriptors", () => {
    expect(parseStockPreferences(null).formats.raster).toBe(true); expect(readFormats(null).eps).toBe(true);
    const p = parseStockPreferences({ formats: { raster: false, eps: true, svg: true }, zoom: 500, destinations: ["other", "shutterstock", "shutterstock"], presets: [{ name: "x", formats: { raster: false } }, null, { name: "" }] });
    expect(p.zoom).toBe(200); expect(p.formats).toEqual({ raster: false, eps: true, svg: true, zip: false }); expect(p.presets).toHaveLength(1); expect(p.destinations).toEqual(["shutterstock"]);
    expect(readDestinations(["ftp://evil", "other"])).toEqual([]); expect(readDestinations(null)).toEqual(["shutterstock"]);
  });
  it("keeps untrusted filenames out of native commands and paths", () => {
    for (const s of ["../a.jpg", "C:\\a.jpg", "a\r\nSTOR x.jpg", "file%2f.jpg", "CON.jpg", "a?.jpg", " a.jpg", ".hidden.jpg"]) expect(safeMediaName(s)).toBe(false);
    expect(safeMediaName("česká vlajka.jpg")).toBe(true);
  });
  it("bounds native manifests, identities, duplicates and EPS approval", () => {
    expect(validManifest(manifest())).toBe(true);
    expect(validManifest(null)).toBe(false); expect(validManifest({ ...manifest(), account: "evil" })).toBe(false);
    expect(validManifest({ ...manifest(), files: [] })).toBe(false);
    const m = manifest(); m.files.push(m.files[0]); expect(validManifest(m)).toBe(false);
    for (const f of [{ ...manifest().files[0], bytes: 50_000_001 }, { ...manifest().files[0], hash: "x" }, { ...manifest().files[0], id: 4 }, { ...manifest().files[0], kind: "png" }, { ...manifest().files[0], name: "a.jpeg", kind: "eps" }]) expect(validManifest({ ...manifest(), files: [f] })).toBe(false);
    const eps = { ...manifest(), files: [{ ...manifest().files[0], kind: "eps", name: "a.eps" }] };
    expect(validManifest(eps)).toBe(false); expect(validManifest({ ...eps, epsReviewed: true })).toBe(true);
  });
  it("checks actual committed JPEG dimensions and vector document/bounds", async () => {
    await expect(checkStockMedia(artifact("jpg"), new File([minimalJpeg(2400, 2400) as BlobPart], "a.jpg"))).resolves.toBeUndefined();
    await expect(checkStockMedia(artifact("jpg"), new File([minimalJpeg(100, 100) as BlobPart], "a.jpg"))).rejects.toThrow(/megapixels/);
    const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%LanguageLevel: 3\n%%BoundingBox: 0 0 2400 2400\n%%EndComments\n0 0 moveto 20 20 lineto stroke\n%%EOF\n";
    await expect(checkStockMedia(artifact("eps"), new File([eps], "a.eps"))).resolves.toBeUndefined();
    await expect(checkStockMedia(artifact("eps"), new File([eps.replace(/2400/g, "10")], "a.eps"))).rejects.toThrow(/4–25/);
    await expect(checkStockMedia(artifact("eps"), new File(["invalid"], "a.eps"))).rejects.toThrow(/invalid/);
    await expect(checkStockMedia(artifact("png"), new File(["png"], "a.png"))).rejects.toThrow(/Unsupported/);
  });
});

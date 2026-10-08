// RULE 8 — the raster stage runs for real with an injectable canvas transport:
// the vectors render at the integer 15.1 MP target, the background is
// flattened, and the JPEG is verified by DECODING it back (SOF dimensions
// must equal the target). A full pipeline test ties prepare → raster → XMP
// embed → verifyJpeg together.
import { describe, expect, it } from "vitest";
import { rasterizeJpeg, withIntrinsicSize, type RasterDeps, type RasterTarget } from "../src/lib/upload/raster";
import { embedXmpMetadata, verifyJpeg } from "../src/lib/upload/jpeg";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { targetDimensions, visibleBounds } from "../src/lib/upload/geom";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upload/meta";

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];
const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const SOURCE = `<svg ${NS} viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

/** A minimal baseline JPEG with the given SOF dimensions. */
function minimalJpeg(width: number, height: number): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]);
}

const target = (w: number, h: number): RasterTarget => ({
  width: w, height: h, quality: 0.92, background: "#ffffff",
});

/** A fake canvas transport that "encodes" a real minimal JPEG of the target size. */
function fakeDeps(w: number, h: number): RasterDeps {
  return {
    render: async () => ({ width: w, height: h }) as unknown as HTMLCanvasElement,
    encode: async () => minimalJpeg(w, h),
  };
}

describe("rasterizeJpeg — vectors at the integer target, verified by decoding", () => {
  it("renders at the target size and records dims, real MP, bytes and hash", async () => {
    const result = await rasterizeJpeg(SOURCE, target(3886, 3886), fakeDeps(3886, 3886));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({
      width: 3886, height: 3886, quality: 0.92, profile: "baseline",
    });
    expect(result.record.megapixels).toBeCloseTo(15.1, 2);
    expect(result.record.bytes).toBe(result.jpeg.length);
    expect(result.record.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("loads its OWN copy with the target px as intrinsic size — the shipped file carries none (2026-10-08)", async () => {
    const sizeless = `<svg ${NS} viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#000"/></svg>`;
    const stamped = withIntrinsicSize(sizeless, 3886, 2000);
    const root = new DOMParser().parseFromString(stamped, "image/svg+xml").documentElement;
    expect(root.getAttribute("width")).toBe("3886");
    expect(root.getAttribute("height")).toBe("2000");
    expect(root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(root.querySelector("rect")?.getAttribute("width")).toBe("80"); // geometry untouched
    expect(withIntrinsicSize(stamped, 10, 10)).toContain(`width="10"`); // an existing size is replaced, not doubled
    expect(withIntrinsicSize("<svg><rect", 1, 1)).toBe("<svg><rect"); // unparseable text passes through for the renderer to refuse
    // the render transport receives the stamped text, never the size-less one
    let seen = "";
    const spy: RasterDeps = {
      render: async (svgText) => { seen = svgText; return { width: 3886, height: 2000 } as unknown as HTMLCanvasElement; },
      encode: async () => minimalJpeg(3886, 2000),
    };
    await rasterizeJpeg(sizeless, target(3886, 2000), spy);
    expect(seen).toContain(`width="3886"`);
    expect(seen).toContain(`height="2000"`);
  });

  it("fails honestly when the decoded dimensions do not match the target", async () => {
    const result = await rasterizeJpeg(SOURCE, target(3886, 3886), fakeDeps(1000, 1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("1000x1000");
  });

  it("fails honestly when the render or the encode throws", async () => {
    const badRender: RasterDeps = { render: async () => { throw new Error("no canvas"); } };
    const r1 = await rasterizeJpeg(SOURCE, target(10, 10), badRender);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toContain("no canvas");
    const badEncode: RasterDeps = {
      render: async () => ({}) as unknown as HTMLCanvasElement,
      encode: async () => { throw new Error("encode failed"); },
    };
    const r2 = await rasterizeJpeg(SOURCE, target(10, 10), badEncode);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain("encode failed");
  });
});

describe("the 15.1 MP pipeline — prepare → target → raster → embed → verify", () => {
  it("a square artboard lands on 3886×3886 and verifies end to end", async () => {
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS };
    const prepared = prepareExportSvg(SOURCE, settings);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const doc = new DOMParser().parseFromString(prepared.svg, "image/svg+xml");
    const vb = visibleBounds(doc.documentElement);
    expect(vb).not.toBeNull();
    const size = targetDimensions(vb!.bounds.width + 2 * prepared.fit.pad, vb!.bounds.height + 2 * prepared.fit.pad, settings.jpegMegapixels);
    expect(size).toMatchObject({ width: 3886, height: 3886 }); // 15 100 996 px
    expect(size.megapixels).toBeCloseTo(15.1, 2);
    const raster = await rasterizeJpeg(prepared.svg, target(size.width, size.height), fakeDeps(size.width, size.height));
    expect(raster.ok).toBe(true);
    if (!raster.ok) return;
    const withMeta = embedXmpMetadata(raster.jpeg, META);
    const v = verifyJpeg(withMeta, { width: size.width, height: size.height, metadata: META });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

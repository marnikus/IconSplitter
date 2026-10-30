import { describe, expect, it } from "vitest";
import { appendUploadShadow } from "../src/lib/upload/shadow";
import { visibleBounds } from "../src/lib/upload/geom/bounds";
import { insideArtboard } from "../src/lib/upload/place";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings } from "../src/lib/upload/settings";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function bounds(el: Element) {
  const cx = Number(el.getAttribute("cx"));
  const cy = Number(el.getAttribute("cy"));
  const rx = Number(el.getAttribute("rx"));
  const ry = Number(el.getAttribute("ry"));
  return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
}

describe("Upload shadow geometry", () => {
  it("reserves a collision-free gradient id without changing a source paint reference", () => {
    const root = new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 100 100">
      <defs><radialGradient id="upload-shadow"><stop/></radialGradient></defs>
      <rect x="20" y="20" width="60" height="60" fill="url(#upload-shadow)"/>
    </svg>`, "image/svg+xml").documentElement;
    const ellipse = appendUploadShadow(root, { minX: 20, minY: 20, width: 60, height: 60 }, 80, 5);
    expect(ellipse?.getAttribute("fill")).toBe("url(#upload-shadow-1)");
    expect(root.querySelector("rect")?.getAttribute("fill")).toBe("url(#upload-shadow)");
    expect(root.querySelectorAll("radialGradient")).toHaveLength(2);
    const gradient = root.querySelector("[id='upload-shadow-1']")!;
    expect(gradient.getAttribute("gradientTransform")).toBeNull();
    expect(gradient.getAttribute("gradientUnits")).toBe("objectBoundingBox");
    expect(["cx", "cy", "r"].map((name) => gradient.getAttribute(name))).toEqual(["0.5", "0.5", "0.5"]);
  });

  it("refuses a shadow whose radius disappears at the export's coordinate precision", () => {
    const root = new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 1 1"/>`, "image/svg+xml").documentElement;
    expect(appendUploadShadow(root, { minX: 0, minY: 0, width: 0.001, height: 1 }, 10, 5)).toBeNull();
    expect(root.querySelector("ellipse, radialGradient")).toBeNull();
  });

  it("does not reveal artwork clipped by the source viewBox when a shadow needs a larger frame", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/>
      <rect x="150" y="20" width="20" height="20"/></svg>`;
    const off = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, AS_IS_SETTINGS));
    expect(off.ok && off.svg).toBe(source); // shadow off remains the approved SVG, unchanged
    const on = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { ...AS_IS_SETTINGS, shadowEnabled: true }));
    expect(on.ok).toBe(false);
    if (!on.ok) {
      expect(on.code).toBe("unsupported");
      expect(on.detail).toMatch(/viewBox|viewport|clipp/i);
    }
  });

  it("preserves the authored width/height-only frame and its margins around a small icon", () => {
    const source = `<svg ${NS} width="100" height="100"><rect x="40" y="40" width="20" height="20"/></svg>`;
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { ...AS_IS_SETTINGS, shadowEnabled: true });
    const result = prepareExportSvg(source, settings);
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    const rect = root.querySelector("rect")!;
    const shade = root.querySelector("ellipse")!;
    expect(root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(result.fit.scale).toBe(1);
    expect(rect.getAttribute("x")).toBe("40");
    expect(rect.getAttribute("y")).toBe("40");
    expect(bounds(shade).width).toBeCloseTo(20 * settings.shadowWidthPct / 100, 2);
    expect(Number(shade.getAttribute("cx"))).toBeCloseTo(50, 2);
    expect(insideArtboard(root)).toBe(true);
  });

  it("ignores zero-opacity paint and invisible groups when sizing and centering the shadow", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/>
      <rect x="150" y="10" width="20" height="20" opacity="0"/>
      <g opacity="0"><rect x="-100" y="0" width="100" height="100" opacity="1"/></g>
      <rect x="5" y="60" width="20" height="20" fill-opacity="0"/>
      <path d="M120 20h30" fill="none" stroke="#000" stroke-opacity="0"/>
    </svg>`;
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { ...AS_IS_SETTINGS, shadowEnabled: true });
    const result = prepareExportSvg(source, settings);
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    const shade = root.querySelector("ellipse")!;
    expect(root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(bounds(shade).width).toBeCloseTo(20 * settings.shadowWidthPct / 100, 2);
    expect(Number(shade.getAttribute("cx"))).toBeCloseTo(50, 2);
    expect(bounds(shade).y).toBeCloseTo(60 + 20 * settings.shadowGapPct / 100, 2);
    expect(insideArtboard(root)).toBe(true);
  });

  it("ignores hidden outliers when testing source clipping and sizing the shadow", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/>
      <rect x="150" y="20" width="20" height="20" display="none"/>
      <g display="none"><rect x="-100" y="0" width="100" height="100" display="inline"/></g>
      <g visibility="hidden"><rect x="120" y="20" width="20" height="20"/></g>
    </svg>`;
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { ...AS_IS_SETTINGS, shadowEnabled: true });
    const result = prepareExportSvg(source, settings);
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    const shade = root.querySelector("ellipse")!;
    expect(root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(bounds(shade).width).toBeCloseTo(16, 2);
    expect(Number(shade.getAttribute("cx"))).toBeCloseTo(50, 2);
  });

  it("does not count a fully transparent gradient stroke around a visible fill", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><defs>
      <linearGradient id="g"><stop stop-color="#000"/></linearGradient></defs>
      <rect x="40" y="40" width="20" height="20" fill="#111"
        stroke="url(#g)" stroke-width="100" stroke-opacity="0"/></svg>`;
    const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
    expect(visibleBounds(root)?.bounds).toEqual({ minX: 40, minY: 40, width: 20, height: 20 });
    const result = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {
      ...AS_IS_SETTINGS, shadowEnabled: true,
    }));
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    const out = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    expect(out.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(bounds(out.querySelector("ellipse")!).width).toBeCloseTo(16, 2);
  });

  it("still sees a visible child of a visibility-hidden group", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/>
      <g visibility="hidden"><rect x="120" y="20" width="20" height="20" visibility="visible"/></g></svg>`;
    const result = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {
      ...AS_IS_SETTINGS, shadowEnabled: true,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/viewBox|clipp/i);
  });

  it("extends a non-origin source frame around wide, distant shade instead of clipping it", () => {
    const source = `<svg ${NS} viewBox="5 10 100 100"><rect x="25" y="40" width="60" height="65" fill="#111"/></svg>`;
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {
      ...AS_IS_SETTINGS, shadowEnabled: true, shadowWidthPct: 200, shadowGapPct: 100,
      artboard: { mode: "content", size: 512, width: 512, height: 512 },
    });
    const result = prepareExportSvg(source, settings);
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    const icon = root.querySelector("rect")!;
    const shade = root.querySelector("ellipse")!;
    const shadeBox = bounds(shade);
    expect(result.fit.artW).toBeGreaterThan(100);
    expect(result.fit.artH).toBeGreaterThan(100);
    expect(shadeBox.width).toBeCloseTo(Number(icon.getAttribute("width")) * 2, 2);
    expect(shadeBox.y).toBeCloseTo(Number(icon.getAttribute("y")) + Number(icon.getAttribute("height")) * 2, 2);
    expect(insideArtboard(root)).toBe(true);
  });
});

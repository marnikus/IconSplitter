import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, type SettingsOverrides } from "../src/lib/upload/settings";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { insideArtboard } from "../src/lib/upload/place";
import { enforceExportSvg } from "../src/lib/upload/clean";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { writeEps, verifyEps } from "../src/lib/upload/eps";
import { measureViewportBounds } from "../src/lib/upload/viewportbounds";
import { repairStrokeFrame } from "../src/lib/upload/viewrepair";

const folder = "tests/assets/bug with SVG export expl temp/";
const files = [
  ["icon-waving-flag_AI_3_01.svg", "078e104b46057df33912ab4fbf65c8698fb8d2bc77fe075b20407326c8bb8785", 224],
  ["icon-waving-flag_AI_5_04.svg", "fdf3f958c67da4875f53e9305230a072fbfa45329a9ee4b6bf7941ef5ffec4e9", 240],
] as const;
const rootOf = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
const variants: [string, SettingsOverrides][] = [
  ["source", AS_IS_SETTINGS], ["factory", {}],
  ["pinned", { strokePx: 2, artboard: { mode: "preset", size: 512, width: 512, height: 512 } }],
  ["rectangular expanded", { strokePx: 3, strokeLinecap: "round", expandStrokes: true, artboard: { mode: "custom", size: 512, width: 512, height: 256 } }],
  ["megapixels", { ...AS_IS_SETTINGS, scaleToMegapixels: true, artboardMegapixels: 1 }],
];

describe.each(files)("actual flag viewport: %s", (file, hash, size) => {
  it.each(variants)("prepares and ships vector SVG/EPS with shadow using %s settings", async (_label, overrides) => {
    const source = readFileSync(folder + file, "utf8");
    const settings = { ...DEFAULT_UPLOAD_SETTINGS, ...overrides, shadowEnabled: true };
    const result = prepareExportSvg(source, settings);
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (!result.ok) return;
    expect(insideArtboard(rootOf(result.svg))).toBe(true);
    expect(rootOf(result.svg).querySelector("ellipse[fill^='url']")).not.toBeNull();
    const cleaned = enforceExportSvg((await optimizeSvg(result.svg, true)).svg);
    expect(cleaned.violations).toEqual([]);
    const eps = writeEps(cleaned.svg, "#ffffff");
    expect(eps.ok, !eps.ok ? eps.reason : "").toBe(true);
    if (eps.ok) { expect(verifyEps(eps.eps).ok).toBe(true); expect(eps.eps).not.toContain("colorimage"); }
    expect(prepareExportSvg(source, settings)).toEqual(result);
    expect(createHash("sha256").update(readFileSync(folder + file)).digest("hex")).toBe(hash);
  });
  it("does not enlarge the original frame or mutate source geometry to repair false overflow", () => {
    const source = readFileSync(folder + file, "utf8"), root = rootOf(source), before = root.outerHTML;
    const frame = { minX: 0, minY: 0, width: size, height: size };
    const measured = measureViewportBounds(root, frame);
    expect(measured.method).toBe("outlined-tight");
    expect(measured.unsupported).toEqual([]);
    expect(measured.painted!.minY).toBeCloseTo(size === 224 ? 7.560711 : 8.191972, 5);
    expect(repairStrokeFrame(root, frame, measured)).toEqual(frame);
    expect(root.outerHTML).toBe(before);
    expect(prepareExportSvg(source, { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS })).toMatchObject({ ok: true, svg: source, asIs: true });
  });
});

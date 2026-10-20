// upload_badge.test.ts — the fixed artboard badge in the prepared export copy.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { insideArtboard } from "../src/lib/upload/place";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ICON = `<svg ${NS} viewBox="0 0 100 100"><rect x="30" y="30" width="40" height="40" fill="#111"/></svg>`;
const badge = (patch: Partial<UploadSettings> = {}): UploadSettings => ({ ...DEFAULT_UPLOAD_SETTINGS,
  badgeEnabled: true, artboard: { mode: "custom", size: 512, width: 512, height: 256 }, paddingPct: 0, ...patch });

function prepared(source: string, settings: UploadSettings) {
  const result = prepareExportSvg(source, settings);
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
  return { result, root };
}

describe("the corner badge in prepared Upload SVG", () => {
  it("keeps badge-off as-is bytes but adds the complete opaque vector when enabled", () => {
    const asIs = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
    expect(prepareExportSvg(ICON, asIs)).toMatchObject({ ok: true, svg: ICON, asIs: true });
    const { root, result } = prepared(ICON, { ...asIs, badgeEnabled: true });
    expect(result.asIs).toBe(false);
    expect(root.querySelectorAll("path")).toHaveLength(7); // one glyph + six handles
    expect(root.querySelector("text, image, [transform]")).toBeNull();
    expect(insideArtboard(root)).toBe(true);
    expect(root.querySelectorAll("path[fill='#000000'][stroke='none']")).toHaveLength(1);
    expect(root.querySelectorAll("path[stroke='#000000']")).toHaveLength(6);
  });

  it("places the badge above a fixed icon without changing its fitted coordinates or background order", () => {
    const settings = badge();
    const off = prepared(ICON, { ...settings, badgeEnabled: false });
    const on = prepared(ICON, settings);
    expect(on.result.fit).toEqual(off.result.fit);
    expect(on.root.getAttribute("viewBox")).toBe("0 0 512 256");
    expect(on.root.firstElementChild?.getAttribute("fill")).toBe("none");
    expect(on.root.querySelector("rect[fill='#111']")?.outerHTML).toBe(off.root.querySelector("rect[fill='#111']")?.outerHTML);
    expect(on.root.lastElementChild?.nodeName).toBe("path");
    expect(insideArtboard(on.root)).toBe(true);
  });

  it("keeps Expand strokes output from recolouring the badge's own paint", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><path d="M10 50h80" fill="none" stroke="#111" stroke-width="2"/></svg>`;
    const { root, result } = prepared(source, badge({ expandStrokes: true }));
    expect(result.strokesExpanded).toBe(1);
    // The expanded icon is filled too, so the badge glyph is the filled path with no stroke.
    expect(root.querySelectorAll("path[fill='#000000'][stroke='none']")).toHaveLength(1);
    expect(root.querySelectorAll("path[stroke='#000000']")).toHaveLength(6);
  });

  it("refuses an impossible edge inset rather than moving the requested distance", () => {
    const result = prepareExportSvg(ICON, badge({ badgeOffsetXPct: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no-fit");
  });

  it("names a source-root opacity that would make the opaque badge translucent", () => {
    const faded = `<svg ${NS} viewBox="0 0 100 100" opacity="0.5"><rect width="100" height="100"/></svg>`;
    const result = prepareExportSvg(faded, badge());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/opacity/i);
  });

  it("names a styled hidden root before mistaking its badge for a no-fit failure", () => {
    const hidden = `<svg ${NS} viewBox="0 0 100 100" style="visibility:hidden">`
      + `<rect visibility="visible" width="100" height="100"/></svg>`;
    const result = prepareExportSvg(hidden, badge());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported");
      expect(result.detail).toMatch(/visibility/i);
    }
  });
});

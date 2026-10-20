// upload_sizeguide.test.ts — the S/L size guide in the prepared export copy.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { insideArtboard, shippedBounds } from "../src/lib/upload/place";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeSettings, parseOverrides, settingsFingerprint, type UploadSettings,
} from "../src/lib/upload/settings";
import { visibleBounds } from "../src/lib/upload/geom/bounds";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ICON = `<svg ${NS} viewBox="0 0 100 100"><rect x="30" y="30" width="40" height="40" fill="#111"/></svg>`;
const STROKED = `<svg ${NS} viewBox="0 0 100 100"><path d="M20 50h60" fill="none" stroke="#111" stroke-width="4"/></svg>`;

const guide = (patch: Partial<UploadSettings> = {}): UploadSettings => ({
  ...DEFAULT_UPLOAD_SETTINGS, sizeGuideEnabled: true, paddingPct: 0,
  artboard: { mode: "custom", size: 512, width: 512, height: 256 }, ...patch,
});

function prepared(source: string, settings: UploadSettings) {
  const result = prepareExportSvg(source, settings);
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
  return { result, root };
}

/** The two <g> wrappers the guide appends, in S-then-L order. */
const copies = (root: Element) => Array.from(root.querySelectorAll(":scope > g"));

describe("the S/L size guide in prepared Upload SVG", () => {
  it("stays off by default: as-is bytes, and the defaults never enable it", () => {
    const asIs = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
    expect(prepareExportSvg(ICON, asIs)).toMatchObject({ ok: true, svg: ICON, asIs: true });
    expect(DEFAULT_UPLOAD_SETTINGS.sizeGuideEnabled).toBe(false);
    expect(normalizeSettings({ sizeGuideEnabled: true }).sizeGuideEnabled).toBe(false);
    expect(parseOverrides({ sizeGuideEnabled: true }).sizeGuideEnabled).toBe(true);
  });

  it("appends the S and L repeats and both supplied letter paths inside the artboard", () => {
    const { root, result } = prepared(ICON, guide());
    expect(result.asIs).toBe(false);
    expect(copies(root)).toHaveLength(2);
    expect(root.querySelectorAll("text, image, [transform]")).toHaveLength(0);
    expect(insideArtboard(root)).toBe(true);
    const labels = Array.from(root.querySelectorAll(":scope > path"));
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.getAttribute("fill")).toBe("#000000");
      expect(label.getAttribute("stroke")).toBe("none");
    }
    // Each repeat is the icon's own geometry, wrapped once.
    expect(copies(root).map((g) => g.querySelectorAll("rect").length)).toEqual([1, 1]);
  });

  it("leaves the icon's fit and background order untouched, and stays after the icons", () => {
    const off = prepared(ICON, guide({ sizeGuideEnabled: false }));
    const on = prepared(ICON, guide());
    expect(on.result.fit).toEqual(off.result.fit);
    expect(on.root.getAttribute("viewBox")).toBe("0 0 512 256");
    expect(on.root.firstElementChild?.getAttribute("fill")).toBe("none");
    expect(on.root.querySelector("rect[fill='#111']")?.outerHTML)
      .toBe(off.root.querySelector("rect[fill='#111']")?.outerHTML);
    expect(insideArtboard(on.root)).toBe(true);
  });

  it("does not repeat the artboard rect or the shadow ellipse", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><path d="M20 20h60v60H20Z" fill="#111"/></svg>`;
    const { root } = prepared(source, guide({ shadowEnabled: true, background: "transparent" }));
    const board = root.querySelector(":scope > rect");
    expect(board?.getAttribute("width")).toBe("512"); // the artboard rect stays single
    for (const copy of copies(root)) {
      expect(copy.querySelector("rect")).toBeNull();
      expect(copy.querySelector("ellipse")).toBeNull();
      expect(copy.querySelectorAll("path")).toHaveLength(1);
    }
  });

  it("gives each repeat its own stroke width from the artboard width", () => {
    const { root } = prepared(STROKED, guide({ sizeGuideSmallStrokePct: 0.5, sizeGuideLargeStrokePct: 1 }));
    const [small, large] = copies(root);
    expect(small.getAttribute("stroke-width")).toBe("2.56");
    expect(large.getAttribute("stroke-width")).toBe("5.12");
  });

  it("scales the placed icon's own stroke width with each repeat when the width is 0", () => {
    const { root } = prepared(STROKED, guide({ sizeGuideSmallStrokePct: 0, sizeGuideLargeStrokePct: 0 }));
    const iconWidth = Number(root.getAttribute("stroke-width")); // hoisted once on the root
    const widths = copies(root).map((copy) => Number(copy.getAttribute("stroke-width")));
    expect(iconWidth).toBeGreaterThan(0);
    expect(widths[0]).toBeCloseTo(iconWidth * 0.06, 2); // the 6% copy of the icon's own weight
    expect(widths[1]).toBeCloseTo(iconWidth * 0.12, 2);
  });

  it("repeats the already-expanded icon when Expand strokes is on, adding no new outline", () => {
    const plain = prepared(STROKED, guide({ expandStrokes: true }));
    expect(plain.root.querySelectorAll("[stroke]:not([stroke='none'])")).toHaveLength(0);
    expect(plain.result.strokesExpanded).toBe(1); // the icon's own stroke, expanded once
    expect(copies(plain.root)).toHaveLength(2); // the repeats clone that finished outline
    for (const copy of copies(plain.root)) expect(copy.querySelector("path")?.getAttribute("fill")).not.toBe("none");
  });

  it("refuses a placement with no room, naming the size guide", () => {
    const result = prepareExportSvg(ICON, guide({ sizeGuideOffsetXPct: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("no-fit");
      expect(result.detail).toMatch(/size guide/i);
    }
  });

  it("keeps the badge last when both decorations share the artboard", () => {
    const { root } = prepared(ICON, guide({ badgeEnabled: true }));
    expect(copies(root)).toHaveLength(2);
    expect(root.lastElementChild?.nodeName).toBe("path");
    expect(insideArtboard(root)).toBe(true);
  });

  it("keeps the pre-existing fingerprint stable and moves it only when the guide is on", () => {
    const asIs = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
    expect(settingsFingerprint(asIs)).toBe(settingsFingerprint({ ...asIs, sizeGuideSmallPct: 9 }));
    expect(settingsFingerprint(guide())).not.toBe(settingsFingerprint(guide({ sizeGuideCorner: "top-left" })));
    expect(settingsFingerprint(guide())).not.toBe(settingsFingerprint(guide({ sizeGuideSmallStrokePct: 1 })));
  });

  it("validates the stored numbers and keeps the guide's own corner vocabulary", () => {
    const read = parseOverrides({
      sizeGuideCorner: "top-right", sizeGuideSmallPct: 400, sizeGuideLargePct: -3,
      sizeGuideSmallStrokePct: 99, sizeGuideGapPct: 7, sizeGuideOffsetXPct: "12",
    });
    expect(read).toMatchObject({
      sizeGuideCorner: "top-right", sizeGuideSmallPct: 100, sizeGuideLargePct: 1,
      sizeGuideSmallStrokePct: 20, sizeGuideGapPct: 7,
    });
    expect(read.sizeGuideOffsetXPct).toBeUndefined();
    const normalized = normalizeSettings({ sizeGuideCorner: "nowhere", sizeGuideLargePct: 30 });
    expect(normalized.sizeGuideCorner).toBe("bottom-left");
    expect(normalized.sizeGuideLargePct).toBe(30);
  });

  it("reports the guide's own box, bottom-left with the requested insets", () => {
    const { root } = prepared(ICON, guide());
    const [small, large] = copies(root);
    const smallBox = visibleBounds(small)?.bounds;
    const largeBox = visibleBounds(large)?.bounds;
    expect(smallBox?.width).toBeCloseTo(30.72, 2);
    expect(largeBox?.width).toBeCloseTo(61.44, 2);
    expect(Math.max((smallBox?.minY ?? 0) + (smallBox?.height ?? 0), (largeBox?.minY ?? 0) + (largeBox?.height ?? 0)))
      .toBeLessThan(256);
    expect(smallBox?.minX).toBeCloseTo(15.36, 1);
    expect(smallBox?.width).toBeLessThan(largeBox?.width ?? 0);
  });

  it("measures the repeats from the icon alone, not from a shadow", () => {
    const noShadow = prepared(ICON, guide());
    const withShadow = prepared(ICON, guide({ shadowEnabled: true }));
    const width = (root: Element) => {
      const b = visibleBounds(copies(root)[1])?.bounds;
      return [b?.width, b?.height];
    };
    expect(width(withShadow.root)).toEqual(width(noShadow.root));
    expect(shippedBounds(copies(withShadow.root)[0])).not.toBeNull();
  });
});

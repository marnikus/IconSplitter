// upload_sizeguide_geometry.test.ts — the S/L size guide the finished icon repeats.
import { describe, expect, it } from "vitest";
import { visibleBounds } from "../src/lib/upload/geom/bounds";
import { shippedBounds } from "../src/lib/upload/place";
import { appendSizeGuide, type SizeGuidePlacement } from "../src/lib/upload/sizeguide";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const FILLED = `<svg ${NS} viewBox="0 0 100 100"><path d="M20 20H80V80H20Z" fill="#111"/></svg>`;
const STROKED = `<svg ${NS} viewBox="0 0 100 100"><path d="M20 20H80V80H20Z" fill="none" stroke="#111" stroke-width="4"/></svg>`;

const guide = (patch: Partial<SizeGuidePlacement> = {}): SizeGuidePlacement => ({
  corner: "bottom-left", offsetXPct: 3, offsetYPct: 3, smallPct: 4, largePct: 8, gapPct: 2, ...patch,
});
const icon = (markup = FILLED) => new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
const artboard = (w = 512, h = 256) => new DOMParser().parseFromString(
  `<svg ${NS} viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="none"/></svg>`, "image/svg+xml").documentElement;
const box = (el: Element) => visibleBounds(el)?.bounds ?? null;

function placed(
  placement: Partial<SizeGuidePlacement> = {},
  markup = FILLED,
  extra: { expand?: boolean; color?: string | null; strokePx?: { small: number | null; large: number | null }; size?: [number, number] } = {},
) {
  const source = icon(markup);
  const bounds = shippedBounds(source);
  if (bounds === null) throw new Error("the fixture icon has no bounds");
  const [width, height] = extra.size ?? [512, 256];
  const root = artboard(width, height);
  const result = appendSizeGuide(root, { width, height }, {
    icon: source, bounds, expand: extra.expand ?? false, color: extra.color ?? null,
    strokePx: extra.strokePx ?? { small: 1.5, large: 3 },
  }, guide(placement));
  return { root, result, bounds };
}

function ok(r: ReturnType<typeof placed>["result"]) {
  if (!r.ok) throw new Error(r.detail);
  return r;
}

describe("the S/L size guide on the final artboard", () => {
  it("places S then L, bottom-aligned at the chosen corner with exact insets", () => {
    const { result } = placed();
    const guide = ok(result);
    const [small, large] = guide.copies;
    expect(box(small.group)?.minX).toBeCloseTo(15.36, 3);
    expect(box(small.group)?.minY).toBeCloseTo(218.0096, 3);
    expect(box(large.group)?.minX).toBeCloseTo(46.08, 3);
    expect(box(large.group)?.minY).toBeCloseTo(197.5296, 3);
    const smallBox = box(small.group);
    const largeBox = box(large.group);
    expect(smallBox?.width).toBeCloseTo(20.48, 3);
    expect(smallBox?.height).toBeCloseTo(20.48, 3);
    expect(largeBox?.width).toBeCloseTo(40.96, 3);
    expect(largeBox?.height).toBeCloseTo(40.96, 3);
    expect((smallBox?.minX ?? 0) + (smallBox?.width ?? 0)).toBeCloseTo(46.08 - 10.24, 3);
    expect(guide.bounds).toMatchObject({ x: 15.36 });
    expect(guide.bounds.width).toBeCloseTo(71.68, 3);
  });

  it.each([
    ["top-left", 15.36, 7.68],
    ["bottom-right", 512 - 15.36 - 71.68, 256 - 7.68 - 50.7904],
  ] as const)("anchors %s using the chosen edges only", (corner, x, y) => {
    const { result } = placed({ corner });
    const guide = ok(result);
    expect(guide.bounds.x).toBeCloseTo(x, 3);
    expect(guide.bounds.y).toBeCloseTo(y, 3);
    expect(box(guide.copies[1].group)?.minX).toBeCloseTo(x + 20.48 + 10.24, 3);
  });

  it("keeps the icon aspect ratio for a tall icon and its own stroke per logo", () => {
    const tall = icon(`<svg ${NS} viewBox="0 0 100 200"><path d="M20 20H80V180H20Z" fill="#111"/></svg>`);
    const bounds = shippedBounds(tall);
    if (bounds === null) throw new Error("no bounds");
    const root = artboard();
    const result = appendSizeGuide(root, { width: 512, height: 256 },
      { icon: tall, bounds, expand: false, color: null, strokePx: { small: null, large: null } },
      guide({ smallPct: 5, largePct: 10 }));
    const built = ok(result);
    const smallBox = box(built.copies[0].group);
    const largeBox = box(built.copies[1].group);
    expect(smallBox?.width).toBeCloseTo(25.6, 3);
    expect(smallBox?.height).toBeCloseTo(68.2667, 2);
    expect(largeBox?.width).toBeCloseTo(51.2, 3);
    expect(largeBox?.height).toBeCloseTo(136.5333, 2);
  });

  it("gives each copy its own verbatim pixel stroke width independent of artboard width", () => {
    const narrowRes = placed({}, STROKED, { color: "#ff0000", strokePx: { small: 1.5, large: 3 }, size: [512, 256] });
    expect(narrowRes.result).toMatchObject({ ok: true });
    const narrow = ok(narrowRes.result);
    const wideRes = placed({}, STROKED, { color: "#ff0000", strokePx: { small: 1.5, large: 3 }, size: [1024, 512] });
    expect(wideRes.result).toMatchObject({ ok: true });
    const wide = ok(wideRes.result);
    expect(strokeWidth(narrow.copies[0].group)).toBe(1.5);
    expect(strokeWidth(narrow.copies[1].group)).toBe(3);
    expect(strokeWidth(wide.copies[0].group)).toBe(1.5);
    expect(strokeWidth(wide.copies[1].group)).toBe(3);
    expect(strokePaint(narrow.copies[0].group)).toBe("#ff0000");
    expect(strokePaint(narrow.copies[1].group)).toBe("#ff0000");
  });

  it("expands both copies' strokes when Expand strokes is on", () => {
    const { result } = placed({}, STROKED, { expand: true });
    const guide = ok(result);
    expect(guide.expanded).toBeGreaterThan(0);
    for (const copy of guide.copies) {
      expect(copy.group.querySelectorAll("[stroke]:not([stroke='none'])")).toHaveLength(0);
    }
  });

  it("draws the supplied S and L letters at ONE size, centred under their own logo", () => {
    const { result } = placed();
    const guide = ok(result);
    const [smallLabel, largeLabel] = guide.copies.map((copy) => box(copy.label));
    const [smallIcon, largeIcon] = guide.copies.map((copy) => box(copy.group));
    expect((smallLabel?.width ?? 0) / (smallLabel?.height ?? 1)).toBeCloseTo(7.84434 / 11.0918, 2);
    expect((largeLabel?.width ?? 0) / (largeLabel?.height ?? 1)).toBeCloseTo(6.54684 / 10.7952, 2);
    // One legend size for both letters (the reference artboard): the SMALLER
    // logo sets it, so L's letter never comes out twice S's.
    expect(smallLabel?.height).toBeCloseTo(0.28 * 20.48, 2);
    expect(largeLabel?.height).toBeCloseTo(0.28 * 20.48, 2);
    expect(largeLabel?.height).toBeCloseTo(smallLabel?.height ?? 0, 3);
    expect(center(smallLabel)).toBeCloseTo(center(smallIcon), 2);
    expect(center(largeLabel)).toBeCloseTo(center(largeIcon), 2);
    expect((smallLabel?.minY ?? 0) + (smallLabel?.height ?? 0)).toBeCloseTo(256 - 7.68, 2);
    expect((largeLabel?.minY ?? 0) + (largeLabel?.height ?? 0)).toBeCloseTo(256 - 7.68, 2);
  });

  it("keeps both letters one size even when the S logo is the larger one", () => {
    const { result } = placed({ smallPct: 8, largePct: 4 });
    const built = ok(result);
    const [smallLabel, largeLabel] = built.copies.map((copy) => box(copy.label));
    expect(smallLabel?.height).toBeCloseTo(0.28 * (512 * 0.04), 2);
    expect(largeLabel?.height).toBeCloseTo(smallLabel?.height ?? 0, 3);
  });

  it("shrinks the pair uniformly — even with a fixed pixel stroke — never moving the inset", () => {
    const { result } = placed({ smallPct: 60, largePct: 60, gapPct: 40 }, STROKED, { strokePx: { small: 12, large: 24 }, size: [120, 80] });
    const guide = ok(result);
    expect(guide.bounds.x).toBeCloseTo(3.6, 3);
    expect(guide.bounds.x + guide.bounds.width).toBeLessThanOrEqual(120 + 1e-6);
    expect(guide.bounds.y + guide.bounds.height).toBeLessThanOrEqual(80 - 2.4 + 1e-6);
    expect(strokeWidth(guide.copies[0].group)).toBe(12);
    expect(strokeWidth(guide.copies[1].group)).toBe(24);
  });

  it("refuses a 100% inset or an out-of-range stroke without appending anything", () => {
    const { root, result } = placed({ offsetXPct: 100 });
    expect(result).toMatchObject({ ok: false, code: "no-fit" });
    expect(root.querySelectorAll("path")).toHaveLength(0);
    const badStroke = placed({}, STROKED, { strokePx: { small: 80, large: 2 } });
    expect(badStroke.result).toMatchObject({ ok: false, code: "unsupported" });
  });

  it("refuses an artboard that is not the one measured, without touching it", () => {
    const source = icon(FILLED);
    const bounds = shippedBounds(source);
    if (bounds === null) throw new Error("no bounds");
    const root = artboard(400, 200);
    const before = root.outerHTML;
    const result = appendSizeGuide(root, { width: 512, height: 256 },
      { icon: source, bounds, expand: false, color: null, strokePx: { small: null, large: null } }, guide());
    expect(result).toMatchObject({ ok: false, code: "unsupported" });
    expect(root.outerHTML).toBe(before);
  });

  it("renames duplicated gradient ids in each copy and their references", () => {
    const gradient = `<svg ${NS} viewBox="0 0 100 100"><defs><linearGradient id="paint"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="20" y="20" width="60" height="60" fill="url(#paint)"/></svg>`;
    const source = icon(gradient);
    const bounds = shippedBounds(source);
    if (bounds === null) throw new Error("no bounds");
    const root = artboard();
    const existing = new DOMParser().parseFromString(`<svg ${NS}><defs><linearGradient id="paint"><stop offset="0"/></linearGradient></defs></svg>`, "image/svg+xml").documentElement;
    root.appendChild(root.ownerDocument.importNode(existing.firstElementChild as Element, true));
    const result = appendSizeGuide(root, { width: 512, height: 256 },
      { icon: source, bounds, expand: false, color: null, strokePx: { small: null, large: null } }, guide());
    ok(result);
    const ids = Array.from(root.querySelectorAll("[id]"), (el) => el.getAttribute("id"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const copy of (result as Extract<typeof result, { ok: true }>).copies) {
      for (const el of Array.from(copy.group.querySelectorAll("[fill^='url(']"))) {
        const id = /url\(#([^)]+)\)/.exec(el.getAttribute("fill") ?? "")?.[1] ?? "";
        expect(root.querySelector(`[id='${id}']`)).not.toBeNull();
      }
    }
  });
});

/** The width the copy's own group (or its stroked shapes) defines. */
function strokeWidth(group: Element): number {
  const own = group.getAttribute("stroke-width");
  if (own !== null) return Number(own);
  return Number(group.querySelector("[stroke-width]")?.getAttribute("stroke-width") ?? NaN);
}

function strokePaint(group: Element): string | null {
  return group.getAttribute("stroke") ?? group.querySelector("[stroke]")?.getAttribute("stroke") ?? null;
}

function center(b: { minX: number; width: number } | null): number {
  return (b?.minX ?? 0) + (b?.width ?? 0) / 2;
}

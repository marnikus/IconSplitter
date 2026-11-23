// builder_export_spacing.test.ts — bug (2026-11-19): the sheet shows the user's
// title / subtitle letter spacing (7/100 em) but the exported SVG and EPS came
// back with none, because (a) the sheet wrote it as an EM fraction that the
// shared outline stage parsed as 0, and (b) the outliner adds PX per glyph.
// The number the artboard shows must be the number the files carry.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { subtitleStyle, titleStyle } from "../src/lib/svgBuilder/rebalance";
import { expandTextToFills, setTextOutliner, type TextRun } from "../src/lib/upload/expandtext";

const BANNER = { ...DEFAULT_CONFIG.banner, position: "top" as const, style: "solid" as const, title: "Quiet line", subtitle: "Icons", titleTracking: 7, subtitleTracking: 3 };
const config = { ...DEFAULT_CONFIG, banner: BANNER };
const svg = () => composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {} }).svg;

/** Each run of one text block: its written letter spacing (px) and its own font size. */
const runsOf = (markup: string, which: "title" | "subtitle"): { px: number; size: number }[] => {
  const group = new RegExp(`<g data-banner-text="${which}"[^>]*>(.*?)</g>`).exec(markup)?.[1] ?? "";
  return [...group.matchAll(/<text\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    return { px: Number(/letter-spacing="([^"]+)"/.exec(tag)?.[1] ?? NaN), size: Number(/font-size="([^"]+)"/.exec(tag)?.[1] ?? NaN) };
  });
};

describe("letter spacing survives into the files", () => {
  it("the composed sheet writes it in PX for its own font size, not as a bare em fraction", () => {
    const markup = svg();
    // 7/100 em added to the reference -0.045 em → 0.025 em; at 32 px that is 0.8 px
    const em = titleStyle(BANNER).spacingEm;
    expect(em).toBeCloseTo(0.025, 6);
    const runs = runsOf(markup, "title");
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.size).toBeGreaterThan(0);
      expect(run.px).toBeGreaterThan(0);
      expect(run.px).toBeCloseTo(em * run.size, 2); // 7/100 em at the run's own size, in px
    }
    expect(markup).not.toMatch(/letter-spacing="[^"]*em"/); // no em string can be misread as 0
  });

  it("the subtitle keeps its own spacing too (3/100 em on the reference 0.16)", () => {
    const em = subtitleStyle(BANNER).spacingEm;
    expect(em).toBeCloseTo(0.19, 6);
    const runs = runsOf(svg(), "subtitle");
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run.px).toBeCloseTo(em * run.size, 2);
  });

  it("the outliner RECEIVES that px per glyph, not 0 — the reported reset", () => {
    const seen: TextRun[] = [];
    setTextOutliner((run) => { seen.push(run); return { d: "M0 0 L10 0 Z", width: 10 }; });
    const out = expandTextToFills(svg());
    setTextOutliner(null);
    expect(out.ok).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    for (const run of seen) expect(run.letterSpacing).not.toBe(0);
    const em = titleStyle(BANNER).spacingEm;
    expect(seen.some((r) => Math.abs(r.letterSpacing - em * r.size) < 0.01)).toBe(true);
  });

  it("an EM length from a third-party sheet is resolved against its own font size", () => {
    const foreign = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">'
      + '<text x="4" y="20" font-size="20" font-family="sans-serif" letter-spacing="0.1em">Wide</text></svg>';
    const seen: TextRun[] = [];
    setTextOutliner((run) => { seen.push(run); return { d: "M0 0 L1 0 Z", width: 1 }; });
    expect(expandTextToFills(foreign).ok).toBe(true);
    setTextOutliner(null);
    expect(seen[0].letterSpacing).toBeCloseTo(2, 6); // 0.1 em × 20 px
  });

  it("nothing changes for a text with no spacing at all", () => {
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="4" y="20" font-size="20">A</text></svg>';
    const seen: TextRun[] = [];
    setTextOutliner((run) => { seen.push(run); return { d: "M0 0 L1 0 Z", width: 1 }; });
    expandTextToFills(plain);
    setTextOutliner(null);
    expect(seen[0].letterSpacing).toBe(0);
  });
});

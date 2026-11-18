// export_expandtext.test.ts — "Expand text to fills" (2026-11-17): every
// <text> run becomes ONE filled <path> of glyph outlines, placed by its own
// anchor; what cannot be outlined is refused by name BEFORE the tree moves.
// The outliner is injected (test fake here, the browser provider in the app).
import { afterEach, describe, expect, it } from "vitest";
import { expandTextToFills, setTextOutliner, type TextRun } from "../src/lib/upload/expandtext";

const fake = (widthOf: (run: TextRun) => number | null = () => 40) => setTextOutliner((run) => {
  const width = widthOf(run);
  return width === null ? null : { d: `M0 0 L${width} 0`, width };
});

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">${body}</svg>`;

afterEach(() => setTextOutliner(null));

describe("expandTextToFills", () => {
  it("replaces a text run with one filled path carrying its paint", () => {
    fake();
    const out = expandTextToFills(svg('<text x="10" y="20" fill="#123456" font-size="12">Hi</text>'));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.svg).not.toContain("<text");
    expect(out.svg).toContain('fill="#123456"');
    expect(out.svg).toContain('d="M0 0 L40 0"');
    expect(out.svg).toContain('transform="translate(10 20)"');
    expect(out.runs).toBe(1);
  });

  it("places middle and end anchors by the run's advance width", () => {
    fake();
    const out = expandTextToFills(svg('<text x="50" y="20" text-anchor="middle" font-size="12">Hi</text><text x="90" y="40" text-anchor="end" font-size="12">Ho</text>'));
    expect(out.ok && out.svg).toContain('transform="translate(30 20)"');
    expect(out.ok && out.svg).toContain('transform="translate(50 40)"');
    expect(out.ok && out.runs).toBe(2);
  });

  it("hands the run's face, weight, size and letter spacing to the outliner", () => {
    let seen: TextRun | null = null;
    setTextOutliner((run) => { seen = run; return { d: "M0 0", width: 1 }; });
    expandTextToFills(svg('<text x="1" y="2" font-size="14.5" font-weight="700" font-family="DM Sans, sans-serif" letter-spacing="1.5" fill="#000000">Ab</text>'));
    expect(seen).toMatchObject({ value: "Ab", size: 14.5, weight: 700, family: "DM Sans, sans-serif", letterSpacing: 1.5, anchor: "start" });
  });

  it("keeps fill-opacity and opacity on the outline path", () => {
    fake();
    const out = expandTextToFills(svg('<text x="0" y="10" fill="#000000" fill-opacity="0.5" opacity="0.8" font-size="8">A</text>'));
    expect(out.ok && out.svg).toContain('fill-opacity="0.5"');
    expect(out.ok && out.svg).toContain('opacity="0.8"');
  });

  it("refuses a stroked text by name and leaves the tree untouched", () => {
    fake();
    const src = svg('<text x="1" y="2" fill="#000000" stroke="#ff0000" stroke-width="1" font-size="8">A</text>');
    const out = expandTextToFills(src);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/stroke/i);
    expect(out.svg).toBe(src);
  });

  it("refuses tspan children — one run per text element only", () => {
    fake();
    const src = svg('<text x="1" y="2" font-size="8">A<tspan x="1" dy="8">B</tspan></text>');
    const out = expandTextToFills(src);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/tspan/i);
    expect(out.svg).toBe(src);
  });

  it("refuses by name when the outliner has no outlines for a run's font", () => {
    fake((run) => (run.family.includes("Missing") ? null : 10));
    const src = svg('<text x="1" y="2" font-family="Missing Face" font-size="8">A</text>');
    const out = expandTextToFills(src);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/Missing Face/);
    expect(out.svg).toBe(src);
  });

  it("refuses the whole document when no outliner exists at all", () => {
    const src = svg('<text x="1" y="2" font-size="8">A</text>');
    const out = expandTextToFills(src);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/outliner/i);
  });

  it("leaves a text-free document alone", () => {
    const out = expandTextToFills(svg('<rect width="4" height="4"/>'));
    expect(out).toMatchObject({ ok: true, runs: 0 });
  });
});

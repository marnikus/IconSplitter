// @vitest-environment happy-dom
// builder_export_hero_eps.test.ts — a banner hero glyph with an accent pen used
// to reach the EPS stage as `stroke="currentColor"`, which the writer refuses
// (an earlier probe: "unsupported paint: currentColor"), so a sheet with a hero
// could not ship an EPS at all. `solidPaint` must resolve every currentColor —
// including one declared on an ancestor inside the painted group — before the
// converter sees the document, and the pen must survive that as the user's px.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { solidPaint } from "../src/svgBuilder/sheetpackage";
import { outlineForEps } from "../src/lib/svgBuilder/epsoutline";
import { writeEps } from "../src/lib/upload/eps";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import type { ExportFormatOptions } from "../src/lib/exportformats";

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const asset = { id: "a", label: "A", fingerprint: "f" } as never;
const config = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top" as const, hero: true, heroStroke: 1, title: "T", subtitle: "S" } };
const doc = composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["a"], svgTexts: { a: ICON } });

describe("a sheet with a banner hero still ships its EPS", () => {
  it("resolves the hero's currentColor, outlines the text, and writes a real EPS", () => {
    setTextOutliner(() => ({ d: "M0 0 L10 0 Z", width: 10 }));
    const painted = solidPaint(doc.svg);
    const outlined = outlineForEps(painted, { epsConverter: "builtin" } as Pick<ExportFormatOptions, "epsConverter">);
    setTextOutliner(null);
    expect(painted).not.toContain("currentColor");
    if (!outlined.ok) throw new Error(`outline refused: ${outlined.reason}`);
    const eps = writeEps(outlined.svg, "#ffffff");
    if (!eps.ok) throw new Error(`EPS refused: ${eps.reason}`);
    expect(eps.ok).toBe(true);
    expect(eps.eps).toContain("%!PS-Adobe-3.0 EPSF-3.0");
    expect(outlined.fixes.length).toBe(1); // the text outline is reported, never silent
  });
});

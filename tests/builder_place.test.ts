// builder_place.test.ts — RULE 8: turning an approved SVG document into something
// a cell can draw. The reference scaled artwork by DOM measurement, which cannot
// run in a node test and cannot be reproduced; here the rules are pure: one root
// <svg>, no scripts, no foreignObject, no image href — a document that breaks any
// of them is REFUSED with the reason, never drawn half-way.
import { describe, expect, it } from "vitest";
import { placeIcon, fittedSvg, PLACE_REFUSALS } from "../src/lib/builder/place";

const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

describe("placeIcon — what a cell may draw", () => {
  it("accepts one inline drawing and keeps its own viewBox", () => {
    const placed = placeIcon(ART);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.box).toBe("0 0 24 24");
    expect(placed.markup).toContain("<path");
  });

  it("strips the XML prolog and any comment before the root", () => {
    const placed = placeIcon(`<?xml version="1.0"?><!-- hand saved -->\n${ART}`);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.markup.startsWith("<svg")).toBe(true);
  });

  it("strips <script>, event handlers and external references instead of drawing them", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><script>alert(1)</script><rect width="8" height="8" onclick="x()"/><image href="https://x/y.png"/></svg>`;
    const placed = placeIcon(dirty);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.markup).not.toContain("script");
    expect(placed.markup).not.toContain("onclick");
    expect(placed.markup).not.toContain("https://");
  });

  it.each([
    ["an empty document", "   ", "empty"],
    ["prose instead of markup", "Here is your icon!", "not-markup"],
    ["broken XML", `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/`, "not-xml"],
    ["a document whose root is not svg", `<html><body/></html>`, "not-svg"],
  ])("refuses %s with a reason", (_label, code, kind) => {
    const placed = placeIcon(code);
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.kind).toBe(kind);
    expect(placed.reason).not.toBe("");
    expect(PLACE_REFUSALS).toContain(kind);
  });

  it("refuses a nested drawing it cannot guarantee the size of", () => {
    const placed = placeIcon(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><foreignObject/></svg>`);
    expect(placed.ok).toBe(false);
  });
});

describe("fittedSvg — the cell's own wrapper", () => {
  it("wraps the artwork so it fills the box and cannot spill out", () => {
    const placed = placeIcon(ART);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const out = fittedSvg(placed, 120);
    expect(out).toContain('width="120"');
    expect(out).toContain('height="120"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain("<path");
  });

  it("draws with the sheet's stroke colour, not the file's", () => {
    const withStroke = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20" stroke="#ff0000"/></svg>`;
    const placed = placeIcon(withStroke);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const out = fittedSvg(placed, 100, { stroke: "#123456", strokeWidth: 2 });
    expect(out).toContain("#123456");
    expect(out).not.toContain("#ff0000");
  });
});

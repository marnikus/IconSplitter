// svgvalidate.test.ts — sanitization and validation gates. Unsafe or broken
// output must never pass; a wrong icon count warns but does not fail.
import { describe, expect, it } from "vitest";
import { sanitizeSvg, validateSvg } from "../src/lib/svgvalidate";

const ICON = '<path d="M2 20L8 8l5 7 6-9 3 14"/>';
const four = `<g>${ICON}</g><g>${ICON}</g><g>${ICON}</g><g>${ICON}</g>`;

describe("sanitizeSvg", () => {
  it("strips script, foreignObject, event handlers and javascript urls", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><foreignObject><div/></foreignObject><path onclick="x()" d="M0 0h5"/><a href="javascript:evil()">${ICON}</a></svg>`;
    const { text, removed } = sanitizeSvg(dirty);
    expect(text).not.toContain("<script");
    expect(text).not.toContain("onclick");
    expect(text).not.toContain("foreignObject");
    expect(text).not.toContain("javascript:");
    expect(removed.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves clean svg untouched", () => {
    const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ICON}</svg>`;
    expect(sanitizeSvg(clean).removed).toEqual([]);
  });
});

describe("validateSvg", () => {
  it("accepts a well-formed four-cluster icon sheet", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${four}</svg>`);
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.iconClusters).toBe(4);
    expect(v.viewBox).toBe("0 0 96 96");
  });

  it("rejects missing viewBox and dimensions", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg">${ICON}</svg>`);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("viewBox");
  });

  it("rejects output with no visible geometry", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs/></svg>`);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/geometry/i);
  });

  it("rejects unsafe content outright", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>bad()</script>${ICON}</svg>`);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/unsafe|script/i);
  });

  it("rejects multiple roots and prose inside the svg", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ICON}</svg><svg xmlns="http://www.w3.org/2000/svg"></svg>`);
    expect(v.ok).toBe(false);
    const prose = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">here is your icon ${ICON}</svg>`);
    expect(prose.warnings.join(" ")).toMatch(/prose|text/i);
  });

  it("warns when the four distinct icons cannot be identified", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g>${ICON}</g><g>${ICON}</g></svg>`);
    expect(v.ok).toBe(true);
    expect(v.iconClusters).toBe(2);
    expect(v.warnings.join(" ")).toMatch(/4|four/i);
  });

  it("reads width/height when there is no viewBox", () => {
    const v = validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">${ICON}</svg>`);
    expect(v.ok).toBe(true);
    expect(v.width).toBe(48);
    expect(v.height).toBe(48);
  });
});

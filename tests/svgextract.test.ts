// svgextract.test.ts — splitting model output into SVG blocks and mapping them
// back to manifest positions by number or <title>, never by appearance.
import { describe, expect, it } from "vitest";
import { extractSvgs, matchSvgs, type ManifestItem } from "../src/lib/svgextract";

const one = (title: string | null, inner = '<path d="M0 0h10"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${title ? `<title>${title}</title>` : ""}${inner}</svg>`;

describe("extractSvgs", () => {
  it("pulls every balanced <svg> root out of prose-heavy output", () => {
    const raw = `Here are your icons.\n${one("fog_architecture_042_AI")}\nSome explanation\nwith <brackets> and a stray </svg>.\n${one("lighthouse_cliff_018_AI")}`;
    const out = extractSvgs(raw);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("fog_architecture_042_AI");
    expect(out[1].title).toBe("lighthouse_cliff_018_AI");
    expect(out[0].text.startsWith("<svg")).toBe(true);
    expect(out[0].text.endsWith("</svg>")).toBe(true);
  });

  it("keeps nested groups balanced and ignores svg mentioned in prose", () => {
    const raw = `The <svg> tag below:\n${one(null, '<g><g><path d="M1 1v2"/></g></g>')} and never use <svg> inline in text.`;
    const out = extractSvgs(raw);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("</g></g></svg>");
    expect(out[0].title).toBeNull();
  });

  it("returns nothing for output with no svg at all", () => {
    expect(extractSvgs("I could not produce SVGs today.")).toEqual([]);
  });
});

describe("numbered code blocks", () => {
  it("reads the fence number when present", () => {
    const raw = "```svg 2\n" + one("x") + "\n```\n```svg 1\n" + one("y") + "\n```";
    const out = extractSvgs(raw);
    expect(out.map((s) => s.order)).toEqual([2, 1]);
  });
});

const items: ManifestItem[] = [
  { position: 1, name: "alpha" },
  { position: 2, name: "beta" },
  { position: 3, name: "gamma" },
];

describe("matchSvgs", () => {
  it("matches by title regardless of order", () => {
    const svgs = extractSvgs(one("beta") + one("alpha"));
    const m = matchSvgs(items, svgs);
    expect(m.byPosition.get(1)).toBe(svgs.find((s) => s.title === "alpha")!.text);
    expect(m.byPosition.get(2)).toBe(svgs.find((s) => s.title === "beta")!.text);
    expect(m.issues.map((i) => i.kind)).toContain("missing"); // gamma absent
    expect(m.byPosition.has(3)).toBe(false);
  });

  it("falls back to explicit numbers, and never shifts on a gap", () => {
    const raw = "```svg 1\n" + one(null) + "\n```\n```svg 3\n" + one(null) + "\n```";
    const m = matchSvgs(items, extractSvgs(raw));
    expect(m.byPosition.has(1)).toBe(true);
    expect(m.byPosition.has(3)).toBe(true);
    expect(m.byPosition.has(2)).toBe(false); // missing stays missing
    expect(m.issues.some((i) => i.kind === "missing" && i.position === 2)).toBe(true);
  });

  it("flags duplicates and unknown titles instead of guessing", () => {
    const m = matchSvgs(items, extractSvgs(one("alpha") + one("alpha") + one("stranger")));
    expect(m.issues.some((i) => i.kind === "duplicate" && i.title === "alpha")).toBe(true);
    expect(m.issues.some((i) => i.kind === "unknown" && i.title === "stranger")).toBe(true);
    expect(m.byPosition.get(1)).toBeUndefined(); // a duplicated title assigns nothing
  });

  it("out-of-range numbers are issues, not assignments", () => {
    const m = matchSvgs(items, extractSvgs("```svg 9\n" + one(null) + "\n```"));
    expect(m.byPosition.size).toBe(0);
    expect(m.issues.some((i) => i.kind === "unknown")).toBe(true);
  });
});

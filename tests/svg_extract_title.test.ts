// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractSvgBlocks, matchBlocksByTitle } from "../src/lib/svgextract";
import type { ManifestItem } from "../src/lib/svgbatch";

const MANIFEST: ManifestItem[] = [
  { position: 1, name: "icon_sun_AI", relPath: "icon_sun_AI.png" },
  { position: 2, name: "icon_moon_AI", relPath: "icon_moon_AI.png" },
  { position: 3, name: "icon_star_AI", relPath: "icon_star_AI.png" },
  { position: 4, name: "icon_cloud_AI", relPath: "icon_cloud_AI.png" },
];

const svg = (title: string | null, marker: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${title ? `<title>${title}</title>` : ""}<path id="${marker}" d="M2 2h20"/></svg>`;

describe("matchBlocksByTitle — strict title matching for multi-SVG batch regeneration", () => {
  it("matches all returned SVGs accurately regardless of output order, case, or .svg extension", () => {
    const raw = [
      svg("ICON_STAR_AI.svg", "star-fix"),
      svg("icon_sun_AI", "sun-fix"),
      svg("icon_cloud_AI.png", "cloud-fix"),
      svg("icon_moon_AI", "moon-fix"),
    ].join("\n\n");

    const out = matchBlocksByTitle(extractSvgBlocks(raw), MANIFEST);
    expect(out.ok).toBe(true);
    expect(out.missing).toEqual([]);
    expect(out.problems).toEqual([]);
    expect(out.byPosition.get(1)).toContain('id="sun-fix"');
    expect(out.byPosition.get(2)).toContain('id="moon-fix"');
    expect(out.byPosition.get(3)).toContain('id="star-fix"');
    expect(out.byPosition.get(4)).toContain('id="cloud-fix"');
  });

  it("refuses blocks with missing or unknown <title> even when preceded by numeric headings (never guesses)", () => {
    const fenced = [
      `1) icon_sun_AI\n\`\`\`svg\n${svg(null, "no-title")}\n\`\`\``,
      `2) icon_moon_AI\n\`\`\`svg\n${svg("wrong_hallucinated_name", "bad-title")}\n\`\`\``,
      `3) icon_star_AI\n\`\`\`svg\n${svg("icon_star_AI", "good-star")}\n\`\`\``,
    ].join("\n\n");

    const out = matchBlocksByTitle(extractSvgBlocks(fenced), MANIFEST);
    expect(out.ok).toBe(false);
    expect(out.byPosition.size).toBe(1);
    expect(out.byPosition.get(3)).toContain('id="good-star"');
    expect(out.missing).toEqual([1, 2, 4]);
    expect(out.problems.some((p) => p.includes("missing <title>"))).toBe(true);
    expect(out.problems.some((p) => p.includes('unknown title "wrong_hallucinated_name"'))).toBe(true);
  });

  it("quarantines duplicate <title> collisions so neither ambiguous block can overwrite an icon", () => {
    const response = [
      svg("icon_sun_AI", "sun-ok"),
      svg("icon_moon_AI", "moon-first"),
      svg("icon_moon_AI", "moon-duplicate-collision"),
      svg("icon_cloud_AI", "cloud-ok"),
    ].join("\n\n");

    const out = matchBlocksByTitle(extractSvgBlocks(response), MANIFEST);
    expect(out.ok).toBe(false);
    expect(out.byPosition.has(2)).toBe(false);
    expect(out.byPosition.get(1)).toContain('id="sun-ok"');
    expect(out.byPosition.get(4)).toContain('id="cloud-ok"');
    expect(out.missing).toEqual([2, 3]);
    expect(out.problems.some((p) => p.includes("duplicate result for title"))).toBe(true);
  });
});

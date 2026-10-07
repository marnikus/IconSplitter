// up_stylebake.test.ts — R04: removing the source's <style> must not change
// the artwork. A class-styled icon (colours, fill:none, stroke, caps, joins,
// even-odd and display) must carry every resolved value as an attribute on the
// export copy, because the copy has no stylesheet left to resolve. Deleting
// the materialization fails every assertion below.
import { describe, expect, it } from "vitest";
import type { Bounds } from "../src/lib/upgeom";
import { parseScene } from "../src/lib/upgeom";
import { sceneBounds } from "../src/lib/upbounds";
import { fitPlan, rasterSize } from "../src/lib/upfit";
import { buildExportSvg, parseSvgText } from "../src/lib/upprepare";

const STYLED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <style>
    .outline { fill: none; stroke: #ff0000; stroke-width: 2; stroke-linecap: round; stroke-linejoin: bevel; }
    .solid { fill: #00ff00; fill-rule: evenodd; stroke: none; }
    .hidden { display: none; }
  </style>
  <g class="outline"><path class="solid" d="M 4 4 L 20 4 L 20 20 L 4 20 Z"/></g>
  <rect class="hidden" x="1" y="1" width="2" height="2" fill="#123456"/>
</svg>`;

const IDENTITY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M 4 4 L 20 4 L 20 20 L 4 20 Z" fill="none" stroke="#101010" stroke-width="2"/>
</svg>`;

function build(source: string): { text: string; root: Element } {
  const doc = parseSvgText(source) as Document;
  const scene = parseScene(doc);
  const bounds = sceneBounds(scene) as Bounds;
  const plan = fitPlan(bounds, { paddingPct: 8, artboard: "square" });
  const text = buildExportSvg({
    source: doc, plan, raster: rasterSize(plan, 15.1), strokePt: 2.2, background: "#ffffff",
  }) as string;
  return { text, root: (parseSvgText(text) as Document).documentElement };
}

function all(root: Element, name: string): Element[] {
  const out: Element[] = [];
  if (root.localName === name) out.push(root);
  for (const c of Array.from(root.children)) out.push(...all(c, name));
  return out;
}

describe("the export copy keeps the source's resolved presentation (R04)", () => {
  it("drops the <style> element and carries the class-styled paint as attributes", () => {
    const { text, root } = build(STYLED);
    expect(all(root, "style")).toEqual([]);
    const path = all(root, "path")[0];
    // The class gave the path its own fill; the group gave it the red outline.
    expect(path.getAttribute("fill")).toBe("#00ff00");
    expect(path.getAttribute("fill-rule")).toBe("evenodd");
    expect(path.getAttribute("stroke")).toBe("none");
    expect(text).toContain("fill=\"#00ff00\"");
    // The group's own class-styled outline survives as attributes on the group,
    // which is what keeps the reset above (stroke:none) meaningful.
    const group = all(root, "g").find((g) => g.getAttribute("stroke") === "#ff0000");
    expect(group).toBeDefined();
    expect(group?.getAttribute("stroke-linejoin")).toBe("bevel");
    expect(group?.getAttribute("stroke-linecap")).toBe("round");
  });

  it("normalizes the stroke width on a class-stroked element, never the class's own value", () => {
    const STROKED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <style>.line { fill: none; stroke: #ff0000; stroke-width: 2; }</style>
      <path class="line" d="M 4 4 L 20 4"/>
    </svg>`;
    const { root } = build(STROKED);
    const path = all(root, "path")[0];
    expect(path.getAttribute("stroke")).toBe("#ff0000");
    expect(Number(path.getAttribute("stroke-width"))).toBeGreaterThan(0);
    expect(path.getAttribute("stroke-width")).not.toBe("2");
  });

  it("keeps a display:none element hidden after the stylesheet is gone", () => {
    const { root } = build(STYLED);
    // The first <rect> in the copy is the appended background; the hidden one
    // is the source's own element inside the fit group.
    const hidden = all(root, "rect").find((r) => r.getAttribute("display") === "none");
    expect(hidden).toBeDefined();
    expect(hidden?.getAttribute("fill")).toBe("#123456");
  });

  it("does not invent attributes for a source that has no stylesheet", () => {
    const { root } = build(IDENTITY);
    const path = all(root, "path")[0];
    expect(path.getAttribute("fill")).toBe("none");
    expect(path.getAttribute("stroke")).toBe("#101010");
    expect(path.getAttribute("stroke-dasharray")).toBeNull();
    expect(path.getAttribute("display")).toBeNull();
  });
});

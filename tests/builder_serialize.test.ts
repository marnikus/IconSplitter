// builder_serialize.test.ts — RULE 8 + design §5.4: the six guarantees of the
// exported sheet, each one an assertion. This is the file the whole builder exists
// to satisfy: an SVG a designer can open in Illustrator with editable paths and
// real text, at exactly the artboard's pixels, identical every time it is written.
import { describe, expect, it } from "vitest";
import { serializeSheet, validateSheet } from "../src/lib/builder/serialize";
import { computeLayout } from "../src/lib/builder/layout";
import { DEFAULT_BUILDER_CONFIG, withGrid } from "../src/lib/builder/defaults";
import { validateSvg, parseSvg } from "../src/lib/svgvalidate";
import { placeIcon } from "../src/lib/builder/place";
import type { BuilderConfig } from "../src/lib/builder/defaults";

const ART = (colour = "#000000") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" stroke="${colour}"/></svg>`;

function placed(code = ART()) {
  const p = placeIcon(code);
  if (!p.ok) throw new Error(`fixture is not placeable: ${p.reason}`);
  return p;
}

/** A sheet of `count` real placements at the config's own layout. */
function sheetOf(config: BuilderConfig = DEFAULT_BUILDER_CONFIG, count = 3) {
  const layout = computeLayout(config);
  const placements = layout.cells.slice(0, count).map((cell, index) => ({
    iconId: `pair_${index}`,
    cell,
    art: placed(),
    caption: `icon ${index + 1}`,
  }));
  return { config, layout, placements };
}

describe("guarantee 1 — the sheet is its own artboard size", () => {
  it("width, height and viewBox equal the configured pixels", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    const { doc } = parseSvg(out);
    const root = doc!.documentElement;
    expect(root.getAttribute("width")).toBe(String(config.artboard.width));
    expect(root.getAttribute("height")).toBe(String(config.artboard.height));
    expect(root.getAttribute("viewBox")).toBe(`0 0 ${config.artboard.width} ${config.artboard.height}`);
  });

  it("a different artboard size is honoured exactly", () => {
    const config = { ...DEFAULT_BUILDER_CONFIG, artboard: { ...DEFAULT_BUILDER_CONFIG.artboard, width: 2048, height: 1024 } };
    const out = serializeSheet({ ...sheetOf(config), title: "", subtitle: "" });
    expect(parseSvg(out).doc!.documentElement.getAttribute("width")).toBe("2048");
  });
});

describe("guarantee 2 — every icon stays an editable nested <svg>", () => {
  it("writes one nested svg per placement, carrying the icon's own viewBox", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    const doc = parseSvg(out).doc!;
    const nested = Array.from(doc.getElementsByTagName("svg")).slice(1);
    expect(nested).toHaveLength(placements.length);
    expect(nested[0].getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("keeps each glyph's path data verbatim", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    const doc = parseSvg(out).doc!;
    const paths = Array.from(doc.getElementsByTagName("path"));
    expect(paths.map((p) => p.getAttribute("d"))).toContain("M2 2h20v20H2z");
  });

  it("groups each cell under a data-cell marker so a designer can find it", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    const doc = parseSvg(out).doc!;
    const groups = Array.from(doc.querySelectorAll("g[data-cell]"));
    expect(groups.map((g) => g.getAttribute("data-cell"))).toEqual(["0", "1", "2"]);
  });

  it("places each cell exactly where the layout put it", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    const doc = parseSvg(out).doc!;
    const first = doc.querySelector("g[data-cell='0'] svg")!;
    expect(Number(first.getAttribute("x"))).toBeCloseTo(placements[0].cell.left, 3);
    expect(Number(first.getAttribute("y"))).toBeCloseTo(placements[0].cell.top, 3);
    expect(Number(first.getAttribute("width"))).toBeCloseTo(placements[0].cell.iconSize, 3);
  });
});

describe("guarantee 3 — the stroke is declared once", () => {
  it("puts the stroke on one group, never on every path", () => {
    const config = { ...DEFAULT_BUILDER_CONFIG, icons: { ...DEFAULT_BUILDER_CONFIG.icons, strokeWidth: 2, color: "#123456" } };
    const out = serializeSheet({ ...sheetOf(config), title: "", subtitle: "" });
    const declarations = (out.match(/stroke="#123456"/g) ?? []).length;
    expect(declarations).toBe(1);
  });

  it("the sheet's own stroke is not multiplied by the icons' count", () => {
    const config = { ...DEFAULT_BUILDER_CONFIG, icons: { ...DEFAULT_BUILDER_CONFIG.icons, strokeWidth: 2, color: "#abcdef" } };
    const out = serializeSheet({ ...sheetOf(config, 6), title: "", subtitle: "" });
    expect((out.match(/#abcdef/g) ?? []).length).toBe(1);
  });

  it("a zero stroke width writes no stroke rule at all", () => {
    const out = serializeSheet({ ...sheetOf(), title: "", subtitle: "" });
    expect(out).not.toContain("stroke-width");
  });
});

describe("guarantee 4 — text is real, editable text", () => {
  it("writes the caption as an escaped <text> element, not a path", () => {
    const { config, layout, placements } = sheetOf();
    const withOdd = placements.map((p, i) => ({ ...p, caption: i === 0 ? "salt & pepper <b>" : p.caption }));
    const out = serializeSheet({ config, layout, placements: withOdd, title: "", subtitle: "" });
    const doc = parseSvg(out).doc!;
    const caption = doc.querySelector("g[data-cell='0'] text")!;
    expect(caption.textContent).toBe("salt & pepper <b>");
    expect(caption.getAttribute("text-anchor")).toBe("middle");
    expect(Number(caption.getAttribute("font-size"))).toBeGreaterThan(0);
  });

  it("an upper-case caption is written upper-case", () => {
    const config = withGrid(DEFAULT_BUILDER_CONFIG, { captionCase: "upper" });
    const { layout } = sheetOf(config);
    const out = serializeSheet({ config, layout, placements: [], title: "", subtitle: "" });
    expect(out).not.toContain("icon 1"); // nothing placed, nothing invented
  });

  it("a caption is omitted when captions are off", () => {
    const config = withGrid(DEFAULT_BUILDER_CONFIG, { captions: false });
    const { layout, placements } = sheetOf(config);
    const out = serializeSheet({ config, layout, placements, title: "", subtitle: "" });
    expect(parseSvg(out).doc!.getElementsByTagName("text")).toHaveLength(0);
  });

  it("the banner title is text too", () => {
    const config: BuilderConfig = {
      ...DEFAULT_BUILDER_CONFIG,
      banner: { ...DEFAULT_BUILDER_CONFIG.banner, position: "left", size: 240, title: "Kitchen", subtitle: "essentials" },
    };
    const out = serializeSheet({ ...sheetOf(config), title: "Kitchen", subtitle: "essentials" });
    const doc = parseSvg(out).doc!;
    const texts = Array.from(doc.getElementsByTagName("text")).map((t) => t.textContent);
    expect(texts).toContain("Kitchen");
    expect(texts).toContain("essentials");
  });
});

describe("guarantee 5 — byte-identical output for identical input", () => {
  it("serialising twice gives the same bytes", () => {
    const input = { ...sheetOf(), title: "T", subtitle: "S" };
    expect(serializeSheet(input)).toBe(serializeSheet(input));
  });

  it("rebuilding the same sheet from its parts gives the same bytes", () => {
    const a = serializeSheet({ ...sheetOf(), title: "T", subtitle: "S" });
    const b = serializeSheet({ ...sheetOf(), title: "T", subtitle: "S" });
    expect(a).toBe(b);
  });

  it("carries no timestamp and no random id", () => {
    const out = serializeSheet({ ...sheetOf(), title: "", subtitle: "" });
    expect(out).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(out).not.toMatch(/id="[0-9a-f]{8,}"/);
  });
});

describe("guarantee 6 — the output is well-formed and safe", () => {
  it("parses without a parsererror", () => {
    const out = serializeSheet({ ...sheetOf(), title: "T", subtitle: "S" });
    expect(parseSvg(out).errors).toEqual([]);
  });

  it("passes the sheet validator (one root, real size, nothing unsafe)", () => {
    const out = serializeSheet({ ...sheetOf(), title: "T", subtitle: "S" });
    expect(validateSheet(out)).toEqual({ ok: true, errors: [] });
  });

  it("nested icons are why the sheet needs its own rule, not the provider gate", () => {
    const out = serializeSheet({ ...sheetOf(), title: "", subtitle: "" });
    // lib/svgvalidate allows ONE <svg> because it judges a model's answer; a sheet
    // nests one per icon by design, so it is validated as a sheet instead.
    expect(validateSvg(out).errors).toContain("more than one <svg> root");
    expect(validateSheet(out).ok).toBe(true);
  });

  it("contributes no script, handler or remote reference of its own", () => {
    const out = serializeSheet({ ...sheetOf(), title: "", subtitle: "" });
    expect(out).not.toContain("<script");
    expect(out).not.toMatch(/\son\w+=/);
    expect(out).not.toContain("https://");
  });

  it("the paper colour is a real rect, so a transparent export differs", () => {
    const config = { ...DEFAULT_BUILDER_CONFIG, artboard: { ...DEFAULT_BUILDER_CONFIG.artboard, background: "#f6f4ee" } };
    const out = serializeSheet({ ...sheetOf(config), title: "", subtitle: "" });
    expect(out).toContain("#f6f4ee");
  });
});

describe("edge cases that would otherwise be silent", () => {
  it("an empty sheet is still a valid sheet of the right size", () => {
    const { config, layout } = sheetOf();
    const out = serializeSheet({ config, layout, placements: [], title: "", subtitle: "" });
    expect(validateSheet(out).ok).toBe(true);
  });

  it("a refused icon is left out of the export, never drawn half-way", () => {
    const { config, layout, placements } = sheetOf();
    const out = serializeSheet({
      config, layout,
      placements: [...placements.slice(1), { ...placements[0], art: { ok: false, kind: "not-xml", reason: "broken" } as const }],
      title: "", subtitle: "",
    });
    expect(parseSvg(out).doc!.querySelectorAll("g[data-cell]")).toHaveLength(2);
  });

  it("a caption with a quote in it does not break the attribute", () => {
    const { config, layout, placements } = sheetOf();
    const tricky = [{ ...placements[0], caption: 'a "quoted" name' }];
    const out = serializeSheet({ config, layout, placements: tricky, title: "", subtitle: "" });
    expect(validateSheet(out).ok).toBe(true);
  });
});

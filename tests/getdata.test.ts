// getdata.test.ts — the "Get data" list (2026-11-10): for the selected rows of
// any tab the user ticks what to copy — the SVG file name, the PNG file name
// (separate choices), the status (generation, review …) and the file path — and
// gets it as a list of info separated with commas.
import { describe, expect, it } from "vitest";
import { DATA_FIELDS, formatData, type DataRow } from "../src/lib/getdata";

const row = (over: Partial<DataRow> = {}): DataRow => ({
  svg: { name: "fish.svg", path: "Sea/fish.svg" },
  png: { name: "fish_AI.png", path: "Sea/fish_AI.png" },
  status: ["generated", "approved"],
  ...over,
});
const rows = [
  row(),
  row({ svg: { name: "owl.svg", path: "Sky/owl.svg" }, png: { name: "owl_AI.png", path: "Sky/owl_AI.png" }, status: ["not generated", "pending"] }),
];

describe("the choices", () => {
  it("are the SVG name and the PNG name (separate), the status and the path", () => {
    expect(DATA_FIELDS.map((f) => f.id)).toEqual(["svg", "png", "status", "path"]);
    expect(DATA_FIELDS.map((f) => f.label).join(" | ")).toMatch(/SVG.*\|.*PNG.*\|.*Status.*\|.*path/i);
  });
});

describe("one choice: a plain list on one line, separated with commas", () => {
  it("SVG names", () => expect(formatData(rows, ["svg"])).toBe("fish.svg, owl.svg"));
  it("PNG names", () => expect(formatData(rows, ["png"])).toBe("fish_AI.png, owl_AI.png"));
  it("statuses join their parts with a dot, so the comma stays the separator", () => {
    expect(formatData(rows, ["status"])).toBe("generated · approved, not generated · pending");
  });
  it("paths: the SVG's when there is one, else the PNG's", () => {
    expect(formatData(rows, ["path"])).toBe("Sea/fish.svg, Sky/owl.svg");
    expect(formatData([row({ svg: null })], ["path"])).toBe("Sea/fish_AI.png");
  });
});

describe("several choices: one line per row, the chosen info separated with commas", () => {
  it("SVG name, PNG name, status, in the dialog's order", () => {
    expect(formatData(rows, ["status", "png", "svg"])).toBe(
      "fish.svg, fish_AI.png, generated · approved\nowl.svg, owl_AI.png, not generated · pending");
  });

  it("the path follows the names that are ticked", () => {
    expect(formatData([row()], ["svg", "path"])).toBe("fish.svg, Sea/fish.svg");
    expect(formatData([row()], ["png", "path"])).toBe("fish_AI.png, Sea/fish_AI.png");
    expect(formatData([row()], ["svg", "png", "path"])).toBe("fish.svg, fish_AI.png, Sea/fish.svg, Sea/fish_AI.png");
  });

  it("a path shared by both names is listed once", () => {
    const same = row({ png: { name: "fish.png", path: "Sea/fish.svg" } });
    expect(formatData([same], ["svg", "png", "path"])).toBe("fish.svg, fish.png, Sea/fish.svg");
  });
});

describe("gaps and odd values", () => {
  it("a row without that file adds nothing for it (no empty entries)", () => {
    const list = [row(), row({ png: null, svg: { name: "owl.svg", path: "owl.svg" } })];
    expect(formatData(list, ["png"])).toBe("fish_AI.png");
    expect(formatData(list, ["svg", "png"])).toBe("fish.svg, fish_AI.png\nowl.svg");
  });

  it("a row with nothing for the chosen info is left out", () => {
    expect(formatData([row({ svg: null, png: null })], ["svg", "png"])).toBe("");
  });

  it("a value with a comma, a quote or a line break is quoted so the list still parses", () => {
    const odd = row({ svg: { name: "a, b.svg", path: "x" }, png: { name: 'say "hi".png', path: "y" } });
    expect(formatData([odd], ["svg"])).toBe('"a, b.svg"');
    expect(formatData([odd], ["png"])).toBe('"say ""hi"".png"');
  });

  it("no choice, or no rows, is an empty text", () => {
    expect(formatData(rows, [])).toBe("");
    expect(formatData([], ["svg"])).toBe("");
  });

  it("an empty status is skipped", () => {
    expect(formatData([row({ status: [] })], ["status"])).toBe("");
  });
});

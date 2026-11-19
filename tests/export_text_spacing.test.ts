// export_text_spacing.test.ts — Title / Subtitle letter spacing (2026-11-19):
// the preset reads in the panel as e.g. 7/100 em, the sheet writes it as
// `letter-spacing="0.025em"`, and every exported format must carry that same
// tracking. The unit is the defect: `Number("0.025em")` is NaN, so expanded text
// (and therefore every EPS, which requires expansion) lost the spacing to 0.
import { afterEach, describe, expect, it } from "vitest";
import { expandTextToFills, setTextOutliner, type TextRun } from "../src/lib/upload/expandtext";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

afterEach(() => setTextOutliner(null));

const spacingsOf = (svg: string): string[] => [...svg.matchAll(/letter-spacing="([^"]+)"/g)].map((match) => match[1]);
const emOf = (value: string): number => Number(value.replace(/em$/, ""));

/** The run the outliner is handed for one standalone `<text>`. */
function runOf(body: string): TextRun {
  let seen: TextRun | null = null;
  setTextOutliner((run) => { seen = run; return { d: "M0 0", width: 1 }; });
  expandTextToFills(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">${body}</svg>`);
  expect(seen).not.toBeNull();
  return seen as unknown as TextRun;
}

describe("expanded text keeps letter spacing given in em", () => {
  it("turns 0.07 em at 100 px into 7 px", () => {
    expect(runOf('<text x="0" y="0" font-size="100" letter-spacing="0.07em">A</text>').letterSpacing).toBeCloseTo(7, 6);
  });

  it("turns 0.025 em at 32 px into 0.8 px", () => {
    expect(runOf('<text x="0" y="0" font-size="32" letter-spacing="0.025em">A</text>').letterSpacing).toBeCloseTo(0.8, 6);
  });

  it("reads the spacing out of an inline style too", () => {
    expect(runOf('<text x="0" y="0" font-size="9" style="letter-spacing:0.23em">A</text>').letterSpacing).toBeCloseTo(2.07, 6);
  });

  it("keeps a plain px value and a negative one", () => {
    expect(runOf('<text x="0" y="0" font-size="10" letter-spacing="1.5">A</text>').letterSpacing).toBe(1.5);
    expect(runOf('<text x="0" y="0" font-size="100" letter-spacing="-0.045em">A</text>').letterSpacing).toBeCloseTo(-4.5, 6);
  });
});

describe("the package hands the sheet's own tracking to the exported formats", () => {
  it("expanded text receives exactly the em value the sheet wrote", async () => {
    const svg = sheetSvg({ titleTracking: 7, subtitleTracking: 7 });
    const spacings = spacingsOf(svg).map(emOf);
    expect(spacings).toEqual(expect.arrayContaining([0.025, 0.23]));
    const runs: TextRun[] = [];
    setTextOutliner((run) => { runs.push(run); return { d: "M0 0 L10 0", width: 10 }; });
    const pkg = await packageOf(svg, { includeEps: true, expandText: true });
    expect(pkg.problems).toEqual([]);
    expect(runs.length).toBe(spacings.length);
    runs.forEach((run, index) => expect(run.letterSpacing).toBeCloseTo(spacings[index] * run.size, 6));
  });

  it("writes the tracking into the plain exported SVG unchanged", async () => {
    const svg = sheetSvg({ titleTracking: 7, subtitleTracking: 7 });
    const pkg = await packageOf(svg, { includeEps: false });
    expect(spacingsOf(textOf(pkg, ".svg") as string)).toEqual(spacingsOf(svg));
  });
});

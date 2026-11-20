// @vitest-environment happy-dom
// export_sheet_ui.test.tsx — the ONE export-format sheet both dialogs render
// (2026-11-17): the same rows, hints and gestures under either test-id scope
// (`upload-set` / `bld-set`), the artboard's real JPEG px (rescale included),
// the no-output warning, the marker slot and the Inkscape helper row.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportFormatSheet, type FormatSheetProps } from "../src/ui/exportsheet";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";

let host: HTMLDivElement;
let root: Root;
let value: ExportFormatOptions;
let patches: Partial<ExportFormatOptions>[];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  patches = [];
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];
const click = (id: string) => act(() => { (q(id) as HTMLInputElement).click(); });
const type = (id: string, next: string) => act(() => {
  const input = q(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

const ARTBOARD = { width: 1000, height: 1000 };

function render(scope: string, initial: ExportFormatOptions, extra: Partial<FormatSheetProps> = {}) {
  value = initial;
  const paint = () => act(() => root.render(
    <ExportFormatSheet scope={scope} value={value} artboard={ARTBOARD}
      patch={(patch) => { value = { ...value, ...patch }; patches.push(patch); paint(); }} {...extra} />,
  ));
  paint();
}

describe("the shared export format sheet", () => {
  it("renders every format row exactly once under the dialog's own scope", () => {
    render("upload-set", { ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    // the upload flow's shipped converter selector is `upload-set-eps-converter`; everything else is `<scope>-<row>`
    for (const id of ["svg", "jpeg", "eps", "eps-converter", "mp", "mp-match", "mp-note", "quality", "optimize", "expand", "expandtext", "rescale", "rescale-mp", "rescale-strokes"]) {
      expect(all(`upload-set-${id}`), id).toHaveLength(1);
    }
    expect(host.textContent).toContain("Export SVG");
    expect(host.textContent).toContain("Also write EPS");
    expect(host.textContent).toContain("EPS converter");
    expect(host.textContent).toContain("Expand text to fills");
    expect(host.textContent).toContain("Scale strokes proportionally");
  });

  it("offers the clean pass where it does something: the builder scope only", () => {
    // The upload flow runs the same policy unconditionally (its own chain needs
    // it), so a box there would be dead — the builder's copy is where it gates.
    render("upload-set", { ...DEFAULT_FORMAT_OPTIONS });
    expect(q("upload-set-clean")).toBeNull();
    render("bld-set", { ...DEFAULT_FORMAT_OPTIONS });
    expect(all("bld-set-clean")).toHaveLength(1);
    expect((q("bld-set-clean") as HTMLInputElement).checked).toBe(true);
    click("bld-set-clean");
    expect(patches.at(-1)).toEqual({ cleanExport: false });
  });

  it("names the real JPEG size in the note — the artboard, rescaled while the rescale box is on", () => {
    render("bld-set", { ...DEFAULT_FORMAT_OPTIONS, jpegMatchArtboard: true });
    expect(q("bld-set-mp-note")?.textContent).toBe("the JPEG is the artboard itself: 1000×1000 px — untick for a bigger file");
    click("bld-set-mp-match");
    expect(q("bld-set-mp-note")?.textContent).toBe("rendered from the vectors at this resolution, at the artboard's aspect ratio");
    click("bld-set-rescale");
    click("bld-set-mp-match");
    // the match box follows the RESCALED artboard: 20 MP of 1000×1000 is 4472×4472
    expect(q("bld-set-mp-note")?.textContent).toBe("the JPEG is the artboard itself: 4472×4472 px — untick for a bigger file");
  });

  it("patches one option (or one coherent pair) per gesture, clamping the numbers", () => {
    render("bld-set", DEFAULT_FORMAT_OPTIONS);
    click("bld-set-jpeg");
    click("bld-set-expandtext");
    type("bld-set-quality", "9");
    type("bld-set-mp", "4");
    expect(patches).toEqual([
      { includeJpeg: false }, { expandText: true }, { jpegQuality: 1 },
      { jpegMegapixels: 4, jpegMatchArtboard: false },
    ]);
    click("bld-set-rescale");
    type("bld-set-rescale-mp", "999");
    expect(patches.slice(-2)).toEqual([{ rescaleArtboard: true }, { rescaleMegapixels: 64 }]);
  });

  it("keeps the no-output warning while every format is off", () => {
    render("bld-set", { ...DEFAULT_FORMAT_OPTIONS, includeSvg: false, includeJpeg: false });
    expect(q("bld-set-formats-warning")?.textContent).toMatch(/at least one/i);
    click("bld-set-eps");
    expect(q("bld-set-formats-warning")).toBeNull();
  });

  it("renders the dialog's inherited/overridden marker slot beside each row", () => {
    render("upload-set", DEFAULT_FORMAT_OPTIONS, {
      marker: (field, testid) => <i data-testid={`marker-${testid}`}>{field}</i>,
    });
    expect(q("marker-svg")?.textContent).toBe("includeSvg");
    expect(q("marker-mp")?.textContent).toBe("jpegMegapixels");
    expect(q("marker-quality")?.textContent).toBe("jpegQuality");
  });

  it("shows the live Inkscape helper row only for that converter, and only writes the converter", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, inkscape: { found: true, version: "1.3.2" } }), { status: 200 })));
    render("bld-set", DEFAULT_FORMAT_OPTIONS);
    expect(q("bld-eps-helper")).toBeNull();
    act(() => {
      const select = q("bld-set-converter") as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set?.call(select, "inkscape");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(patches).toEqual([{ epsConverter: "inkscape" }]);
    expect(value.includeEps).toBe(false); // choosing a writer never switches EPS on
    expect(q("bld-eps-helper")).not.toBeNull();
    expect(q("bld-eps-helper-url")).not.toBeNull();
  });
});

// builder_export_settings_ui.test.tsx — the builder's Export settings dialog
// (2026-11-17): the SAME rows and hints the upload dialog shows, on the
// builder's own persisted options; the Export menu opens it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuilderFormatSettings } from "../src/svgBuilder/SvgBuilderFormatDialog";
import SvgBuilderExportMenu from "../src/svgBuilder/SvgBuilderExportMenu";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";
import type { BuilderApi } from "../src/svgBuilder/useSvgBuilder";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const click = (testid: string) => act(() => {
  (host.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement).click();
});

let value: ExportFormatOptions;
/** The dialog is controlled: a patch re-renders with the next value, like the store-backed wrapper does. */
function render(initial: ExportFormatOptions) {
  value = initial;
  const onPatch = (patch: Partial<ExportFormatOptions>) => {
    value = { ...value, ...patch };
    act(() => root.render(<BuilderFormatSettings value={value} onPatch={onPatch} onClose={() => undefined} />));
    patches.push(patch);
  };
  act(() => root.render(<BuilderFormatSettings value={value} onPatch={onPatch} onClose={() => undefined} />));
}
const patches: Partial<ExportFormatOptions>[] = [];

describe("the builder export settings rows", () => {
  it("shows every format row the reference sheet has", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    for (const testid of ["svg", "jpeg", "eps", "converter", "mp", "mp-match", "quality", "optimize", "expand", "expandtext", "rescale", "rescale-mp", "rescale-strokes"]) {
      expect(host.querySelector(`[data-testid="bld-set-${testid}"]`)).not.toBeNull();
    }
    expect(host.textContent).toContain("Export SVG");
    expect(host.textContent).toContain("Also write EPS");
    expect(host.textContent).toContain("Expand strokes to fills");
    expect(host.textContent).toContain("Expand text to fills");
    expect(host.textContent).toContain("Rescale artboard to MP");
    expect(host.textContent).toContain("Scale strokes proportionally");
  });

  it("patches one option per gesture", () => {
    patches.length = 0;
    render(DEFAULT_FORMAT_OPTIONS);
    click("bld-set-svg");
    click("bld-set-expandtext");
    click("bld-set-rescale");
    click("bld-set-rescale-strokes");
    expect(patches).toEqual([{ includeSvg: false }, { expandText: true }, { rescaleArtboard: true }, { rescaleStrokes: false }]);
  });

  it("clamps the numbers it accepts", () => {
    patches.length = 0;
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const type = (testid: string, next: string) => act(() => {
      const input = host.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement;
      set?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type("bld-set-quality", "9");
    type("bld-set-rescale-mp", "999");
    expect(patches).toEqual([{ jpegQuality: 1 }, { rescaleMegapixels: 64 }]);
  });
});

describe("the Export menu", () => {
  it("opens the settings dialog from its own item", () => {
    let opened = 0;
    const api = {
      busy: null,
      config: { artboard: { width: 1080, height: 660 } },
      actions: { openExportFormats: () => { opened += 1; } },
    } as unknown as BuilderApi;
    act(() => root.render(<SvgBuilderExportMenu b={api} />));
    act(() => { (host.querySelector('[data-testid="builder-export-toggle"]') as HTMLButtonElement).click(); });
    expect(host.querySelector('[data-testid="builder-export-formats"]')).not.toBeNull();
    act(() => { (host.querySelector('[data-testid="builder-export-formats"]') as HTMLButtonElement).click(); });
    expect(opened).toBe(1);
  });
});

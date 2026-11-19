// builder_export_settings_ui.test.tsx — the builder's Export settings popup
// (2026-11-17, repaired 2026-11-19): the SAME rows and hints the upload dialog
// shows, on the builder's own persisted options; the Export menu opens it.
// 2026-11-19 pins: every field exists exactly ONCE (the old dialog rendered the
// JPEG block twice), the converter hint carries no raw HTML entity, the JPEG
// hint names the sheet's real px, and the all-off state is a named alert.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderFormatSettings } from "../src/svgBuilder/SvgBuilderFormatDialog";
import SvgBuilderExportMenu from "../src/svgBuilder/SvgBuilderExportMenu";
import { FormatSettingsButton } from "../src/svgBuilder/SvgBuilderHeader";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";
import { ConverterSetting } from "../src/upload/UploadEpsSettings";
import type { UploadSettingsDialogProps } from "../src/upload/settingsfield";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import type { BuilderApi } from "../src/svgBuilder/useSvgBuilder";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const q = (testid: string) => host.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | null;
const click = (testid: string) => act(() => { q(testid)!.click(); });

const ARTBOARD = { width: 1080, height: 660 };
let value: ExportFormatOptions;
const patches: Partial<ExportFormatOptions>[] = [];

/** The popup is controlled: a patch re-renders with the next value, like the store-backed wrapper does. */
function render(initial: ExportFormatOptions) {
  value = initial;
  const onPatch = (patch: Partial<ExportFormatOptions>) => {
    value = { ...value, ...patch };
    patches.push(patch);
    act(() => root.render(<BuilderFormatSettings value={value} onPatch={onPatch} onClose={() => undefined} artboard={ARTBOARD} />));
  };
  act(() => root.render(<BuilderFormatSettings value={value} onPatch={onPatch} onClose={() => undefined} artboard={ARTBOARD} />));
}

describe("the builder export settings rows", () => {
  it("shows every format row the reference sheet has", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    for (const testid of ["svg", "jpeg", "eps", "eps-converter", "mp", "mp-match", "quality", "optimize", "expand", "expandtext", "rescale", "rescale-mp", "rescale-strokes"]) {
      expect(q(`bld-set-${testid}`), testid).not.toBeNull();
    }
    expect(host.textContent).toContain("Export SVG");
    expect(host.textContent).toContain("Also write EPS");
    expect(host.textContent).toContain("Expand strokes to fills");
    expect(host.textContent).toContain("Expand text to fills");
    expect(host.textContent).toContain("Rescale artboard to MP");
    expect(host.textContent).toContain("Scale strokes proportionally");
  });

  it("renders each field EXACTLY once — the duplicate JPEG block is gone", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    const ids = [...host.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid") ?? "");
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("writes the converter hint as text, not as a raw HTML entity", () => {
    render(DEFAULT_FORMAT_OPTIONS);
    const hint = q("bld-set-eps-converter")!.closest("label")!.querySelector("small")!.textContent ?? "";
    expect(hint).toContain('"Also write EPS"');
    expect(hint).not.toContain("&quot;");
  });

  it("names the sheet's real artboard px, and the rescaled ones", () => {
    render(DEFAULT_FORMAT_OPTIONS);
    const hint = () => q("bld-set-mp-match")!.closest("label")!.querySelector("small")!.textContent ?? "";
    expect(hint()).toContain("1080×660 px");
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true, rescaleMegapixels: 20 });
    // 1080×660 @ 20 MP: factor 5.29…, ratio kept, area never above the target
    expect(hint()).toContain("5720×3495 px");
    expect(q("builder-format-summary")!.textContent).toContain("rescaled from 1080×660");
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
      const input = q(testid)!;
      set?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type("bld-set-quality", "9");
    type("bld-set-rescale-mp", "999");
    expect(patches).toEqual([{ jpegQuality: 1 }, { rescaleMegapixels: 64 }]);
  });

  it("warns before anything is exported when every format is off", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, includeSvg: false, includeJpeg: false, includeEps: false });
    expect(q("bld-set-formats-warning")?.textContent).toMatch(/at least one export format/i);
    render(DEFAULT_FORMAT_OPTIONS);
    expect(q("bld-set-formats-warning")).toBeNull();
  });

  it("offers the Inkscape helper row the upload dialog has", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, epsConverter: "inkscape" });
    expect(q("upload-eps-helper")).not.toBeNull();
    expect(q("upload-eps-helper-url")).not.toBeNull();
  });
});

describe("the shared row markup (one implementation, two flows)", () => {
  it("gives the upload scope the same rows with its own prefix and markers", () => {
    const p = {
      scope: null, id: null, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {}, selectedCount: 0,
      onDefaults: () => undefined, onOverride: () => undefined, onResetOverride: () => undefined,
      onApplyLocal: () => undefined, onSelectedShadowToggle: () => undefined,
      onSelectedShadowDimensions: () => undefined, onSelectedBadgeToggle: () => undefined,
      onSelectedSizeGuideToggle: () => undefined, onClose: () => undefined,
      selectedShadow: null, selectedBadge: null, selectedSizeGuide: null,
    } as unknown as UploadSettingsDialogProps;
    act(() => root.render(<ConverterSetting p={p} effective={DEFAULT_UPLOAD_SETTINGS} />));
    expect(q("upload-set-eps-converter")).not.toBeNull();
    // ConverterSetting is the upload dialog's own row (a div + label span, not an ExportSelectRow)
    const hint = q("upload-set-eps-converter")!.parentElement!.querySelector("small")!.textContent ?? "";
    expect(hint).toContain('"Also write EPS"');
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
    act(() => { (q("builder-export-toggle") as HTMLButtonElement).click(); });
    expect(q("builder-export-formats")).not.toBeNull();
    act(() => { (q("builder-export-formats") as HTMLButtonElement).click(); });
    expect(opened).toBe(1);
  });

  it("says which formats the next package will carry", () => {
    localStorage.clear();
    const api = {
      busy: null,
      config: { artboard: { width: 1080, height: 660 } },
      actions: { openExportFormats: () => undefined },
    } as unknown as BuilderApi;
    act(() => root.render(<SvgBuilderExportMenu b={api} />));
    act(() => { (q("builder-export-toggle") as HTMLButtonElement).click(); });
    const hint = q("builder-export-formats")!.querySelector("span")!.textContent ?? "";
    expect(hint).toContain("SVG + JPEG"); // the stored defaults
  });
});

describe("the settings are one gesture away in the toolbar", () => {
  it("ships a SEPARATED ⚙ Export settings button beside Export ▾, naming the formats", async () => {
    const api = { busy: null, actions: { openExportFormats: () => undefined } } as unknown as Pick<BuilderApi, "busy" | "actions">;
    act(() => root.render(<FormatSettingsButton b={api} />));
    const button = q("builder-format-open") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Export settings");
    expect(button!.title).toContain("SVG + JPEG"); // the stored defaults, said out loud
    // a real button, not an item inside the Export ▾ dropdown
    expect(button!.closest(".bld-menu")).toBeNull();
    expect(button!.getAttribute("role")).toBeNull();
  });

  it("opens the same popup the menu item does", async () => {
    const open = vi.fn();
    const api = { busy: null, actions: { openExportFormats: open } } as unknown as Pick<BuilderApi, "busy" | "actions">;
    act(() => root.render(<FormatSettingsButton b={api} />));
    await act(async () => { (q("builder-format-open") as HTMLButtonElement).click(); });
    expect(open).toHaveBeenCalledTimes(1);
  });
});

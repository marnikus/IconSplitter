// Layout contracts for the real popup; DOM/CSS checks, not browser geometry measurements.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UploadSettingsDialog, { type UploadSettingsDialogProps } from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const input = (id: string) => q(`upload-set-${id}`) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(id: string | null = null): UploadSettingsDialogProps {
  const p: UploadSettingsDialogProps = {
    scope: id === null ? null : "icon.svg", id,
    defaults: { ...DEFAULT_UPLOAD_SETTINGS, artboard: { mode: "custom", width: 5500, height: 3100, size: 512 },
      paddingPct: { left: 8, right: 8, top: 8, bottom: 12 } },
    overrides: {}, applied: {}, selectedCount: 0,
    selectedShadow: { state: "none", width: 85, gap: 4 }, selectedBadge: { state: "none" }, selectedSizeGuide: { state: "none" },
    onSelectedShadowToggle: vi.fn(), onSelectedShadowDimensions: vi.fn(), onSelectedBadgeToggle: vi.fn(),
    onSelectedSizeGuideToggle: vi.fn(), onApplyLocal: vi.fn(), onDefaults: vi.fn(), onOverride: vi.fn(),
    onResetOverride: vi.fn(), onClose: vi.fn(),
  };
  act(() => root.render(<UploadSettingsDialog {...p} />));
  return p;
}

it.each([null, "icon-id"])('groups padding, artboard and paints without hiding controls (scope %s)', (id) => {
  mount(id);
  const visual = q("upload-set-visual");
  expect(visual).not.toBeNull();
  expect(visual.parentElement!.classList.contains("up-set-grid")).toBe(true);
  expect(visual.children).toHaveLength(3);
  expect(visual.children[0]).toBe(q("upload-set-padding-group"));
  expect(visual.children[1].contains(input("artboard"))).toBe(true);
  const paints = visual.children[2];
  expect(paints.contains(input("stroke-color-custom"))).toBe(true);
  expect(paints.contains(input("linecap"))).toBe(true);
  const ids = ["padding-default", "padding-left", "padding-right", "padding-top", "padding-bottom", "artboard",
    "artboard-w", "artboard-h", "artboard-ratio", "artboard-mp", "mp-scale", "mp-target", "stroke-color-artwork",
    "stroke-color-black", "stroke-color-white", "stroke-color-gray", "stroke-color-green", "stroke-color-red", "stroke-color-custom", "stroke-color-value", "linecap"];
  for (const key of ids) {
    const control = q(`upload-set-${key}`);
    expect(control, key).not.toBeNull();
    expect(visual.contains(control), key).toBe(true);
    expect(control.closest('details, [hidden], [aria-hidden="true"]'), key).toBeNull();
  }
  expect(input("padding-bottom").value).toBe("12");
  if (id === null) expect(q("upload-set-stroke")).toBeNull();
  if (id !== null) {
    expect(q("upload-set-stroke")).not.toBeNull();
    expect(paints.contains(q("upload-set-stroke"))).toBe(true);
    expect(q("upload-set-stroke").parentElement!.classList.contains("up-stroke-width-row")).toBe(true);
    expect(q("upload-set-marker-artboard").textContent).toBe("inherited");
  }
});

it('pairs labelled width/height and keeps both readouts and all scale controls in compact rows', () => {
  mount();
  const custom = host.querySelector(".up-artboard-custom")!;
  expect(custom).not.toBeNull();
  expect(custom.querySelectorAll(":scope > label")).toHaveLength(2);
  expect(input("artboard-w").closest("label")!.textContent).toContain("Width px");
  expect(input("artboard-h").closest("label")!.textContent).toContain("Height px");
  expect(q("upload-set-artboard-ratio").textContent).toBe("55:31");
  expect(q("upload-set-artboard-mp").textContent).toBe("17.05 MP");
  const scale = host.querySelector(".up-artboard-scale")!;
  expect(scale).not.toBeNull();
  expect(scale.children).toHaveLength(4);
  expect(scale.children[0].contains(input("mp-scale"))).toBe(true);
  expect(scale.children[1]).toBe(input("mp-target"));
  expect(scale.children[2].textContent).toBe("MP");
  expect(scale.children[3]).toBe(q("upload-set-mp-scale-note"));
  expect(input("mp-scale").disabled).toBe(true);
  expect(input("mp-target").disabled).toBe(true);
  expect(q("upload-set-padding-default").parentElement!.classList.contains("up-padding-head")).toBe(true);
});

it('keeps responsive grids scoped to the visual area, without hiding or shrinking controls', () => {
  const css = readFileSync("src/index.css", "utf8");
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  expect(css).toContain(".up-visual-settings {");
  const visual = rule(".up-visual-settings");
  expect(visual).toContain("grid-column: 1 / -1");
  expect(visual).toContain("repeat(auto-fit, minmax(min(100%, 220px), 1fr))");
  expect(visual).toContain("align-items: start");
  expect(rule(".up-artboard-custom")).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  expect(rule(".up-bg-row.up-artboard-scale")).toContain("grid-template-columns: minmax(0, auto) minmax(64px, 1fr) auto");
  expect(rule(".up-bg-row.up-artboard-scale > small")).toContain("grid-column: 1 / -1");
  expect(rule(".up-visual-settings .up-hint")).toContain("display: block");
  for (const selector of [".up-visual-settings", ".up-artboard-custom", ".up-bg-row.up-artboard-scale", ".up-visual-paints"]) {
    expect(rule(selector)).not.toMatch(/display:\s*none|visibility:\s*hidden|overflow:\s*hidden|font-size/);
  }
});

it('preserves direct live field writes and width commits after regrouping', () => {
  const p = mount();
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input("padding-bottom"), "16"); input("padding-bottom").dispatchEvent(new Event("input", { bubbles: true })); });
  expect(p.onDefaults).toHaveBeenLastCalledWith({ paddingPct: { left: 8, right: 8, top: 8, bottom: 16 } });
  p.onDefaults = vi.fn();
  act(() => root.render(<UploadSettingsDialog {...p} />));
  const width = input("artboard-w");
  act(() => { width.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(width, "6400"); width.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(p.onDefaults).not.toHaveBeenCalled();
  act(() => width.blur());
  expect(p.onDefaults).toHaveBeenCalledWith({ artboard: { mode: "custom", width: 6400, height: 3100, size: 512 } });
});

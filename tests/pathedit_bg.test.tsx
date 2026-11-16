// pathedit_bg.test.tsx — the edit mode's artboard background (2026-11-06): the
// user picks it in the top bar from the same PREVIEW BG presets (or a custom
// colour) the lists use; white by default; remembered on this device.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";
import { EDIT_SETTINGS_KEY, forgetEditSettings, getEditSettings } from "../src/svg/editsettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { localStorage.removeItem(EDIT_SETTINGS_KEY); forgetEditSettings(); host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });

const SRC = '<svg viewBox="0 0 24 24"><path d="M2 2L12 2"/></svg>';
const board = () => host.querySelector(".svg-edit-board") as HTMLElement;
const mount = () => act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 200, height: 200 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} />); });

describe("the artboard background", () => {
  it("is white by default", async () => {
    await mount();
    expect(getEditSettings().bg.preset).toBe("white");
    expect(board().style.background).toMatch(/#ffffff|rgb\(255, 255, 255\)/i);
  });

  it("follows a preset picked in the top bar and is remembered", async () => {
    await mount();
    await act(async () => { (host.querySelector("[data-testid=svg-edit-bg-black]") as HTMLButtonElement).click(); });
    expect(board().style.background).toMatch(/#000000|rgb\(0, 0, 0\)/i);
    expect(JSON.parse(localStorage.getItem(EDIT_SETTINGS_KEY) ?? "{}").bg.preset).toBe("black");
    forgetEditSettings();
    expect(getEditSettings().bg.preset).toBe("black");
  });

  it("takes a custom colour; a damaged stored value falls back to white", async () => {
    await mount();
    const pick = host.querySelector("[data-testid=svg-edit-bg-custom]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(pick, "#123456");
      pick.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getEditSettings().bg).toEqual({ preset: "custom", custom: "#123456" });
    forgetEditSettings();
    localStorage.setItem(EDIT_SETTINGS_KEY, JSON.stringify({ bg: { preset: "plaid" } }));
    expect(getEditSettings().bg.preset).toBe("white");
  });
});

describe("the background really shows", () => {
  it("the preview's transparency checkerboard is switched off inside the artboard (2026-11-06 report)", () => {
    expect(readFileSync("src/index.css", "utf8")).toMatch(/\.svg-edit-board \.svg-preview \{ background: none; \}/);
  });
});

describe("one picker, reused", () => {
  it("Generate SVG, SVG to upload and the edit mode share PreviewBgPicker", () => {
    for (const f of ["src/svg/SvgBulkBar.tsx", "src/upload/UploadBulkBar.tsx", "src/svg/pathedit/SvgPathEditor.tsx"]) {
      expect(readFileSync(f, "utf8")).toContain("<PreviewBgPicker");
    }
  });
});

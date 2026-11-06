import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadSettingsDialog, { type UploadSettingsDialogProps } from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, ui: Root, props: UploadSettingsDialogProps;
const sideNames = ["left", "right", "top", "bottom"] as const;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const field = (side: string) => q(`upload-set-padding-${side}`) as HTMLInputElement;
const render = () => ui.render(<UploadSettingsDialog {...props} />);
async function type(side: string, value: string) {
  await act(async () => {
    const input = field(side);
    expect(input).not.toBeNull();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host);
  props = {
    id: null, scope: null, defaults: { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 12 }, overrides: {}, applied: {}, selectedCount: 2,
    selectedShadow: { state: "mixed", width: null, gap: null }, selectedBadge: { state: "mixed" }, selectedSizeGuide: { state: "mixed" },
    onSelectedShadowToggle: vi.fn(), onSelectedShadowDimensions: vi.fn(), onSelectedBadgeToggle: vi.fn(), onSelectedSizeGuideToggle: vi.fn(),
    onApplyLocal: vi.fn(), onDefaults: vi.fn((patch) => { props.defaults = { ...props.defaults, ...patch }; render(); }),
    onOverride: vi.fn((_id, patch) => { props.overrides = patch; render(); }),
    onResetOverride: vi.fn(() => { props.overrides = {}; render(); }), onClose: vi.fn(),
  };
});
afterEach(async () => { await act(async () => ui.unmount()); host.remove(); });

describe.each(["global", "per-icon"])("independent padding inputs — %s", (scope) => {
  async function mount() {
    if (scope === "per-icon") { props.id = "one"; props.scope = "one.svg"; props.overrides = { strokePx: 3 }; }
    await act(async () => render());
  }
  it("replaces the uniform input with four labelled inherited values", async () => {
    await mount();
    for (const side of sideNames) {
      expect(field(side)).not.toBeNull(); expect(field(side).value).toBe("12");
      expect(field(side).getAttribute("aria-label")).toBe(`${side[0].toUpperCase() + side.slice(1)} padding %`);
      expect(host.querySelector(`label[for="${field(side).id}"]`)?.textContent).toContain(side[0].toUpperCase() + side.slice(1));
    }
    expect(host.querySelector('input[data-testid="upload-set-padding"]')).toBeNull();
    expect(props.onDefaults).not.toHaveBeenCalled(); expect(props.onOverride).not.toHaveBeenCalled();
  });
  it("edits sides independently and routes one gesture through the existing settings path", async () => {
    await mount(); await type("left", "7"); await type("bottom", "19");
    const expected = { left: 7, right: 12, top: 12, bottom: 19 };
    if (scope === "global") {
      expect(props.defaults.paddingPct).toEqual(expected);
      expect(props.onDefaults).toHaveBeenCalledTimes(2); expect(props.onOverride).not.toHaveBeenCalled();
    } else {
      expect(props.overrides).toEqual({ strokePx: 3, paddingPct: expected });
      expect(props.onOverride).toHaveBeenCalledTimes(2); expect(props.onDefaults).not.toHaveBeenCalled();
      expect(q("upload-set-marker-padding").textContent).toBe("overridden");
      await act(async () => q("upload-set-reset").click());
      expect(props.onResetOverride).toHaveBeenCalledWith("one");
      for (const side of sideNames) expect(field(side).value).toBe("12");
    }
    expect(props.onSelectedShadowToggle).not.toHaveBeenCalled();
    expect(props.onSelectedBadgeToggle).not.toHaveBeenCalled(); expect(props.onSelectedSizeGuideToggle).not.toHaveBeenCalled();
  });
  it("clamps just the edited side and treats an empty numeric side as zero", async () => {
    await mount(); await type("right", "90"); await type("top", "-5"); await type("left", "");
    expect(field("right").value).toBe("50"); expect(field("top").value).toBe("0");
    expect(field("left").value).toBe("0"); expect(field("bottom").value).toBe("12");
  });
  it("keeps source Default and its toggle back to four 8s", async () => {
    await mount(); await type("left", "7");
    await act(async () => q("upload-set-padding-default").click());
    for (const side of sideNames) expect(field(side).value).toBe("");
    expect(q("upload-set-padding-default").getAttribute("aria-pressed")).toBe("true");
    await act(async () => q("upload-set-padding-default").click());
    for (const side of sideNames) expect(field(side).value).toBe("8");
    await act(async () => q("upload-set-padding-default").click());
    await type("top", "3");
    expect(field("top").value).toBe("3"); expect(field("left").value).toBe("8");
  });
  it("All default clears asymmetric padding without resetting the decoration disclosure state", async () => {
    await mount(); await type("bottom", "25");
    await act(async () => q("upload-set-badge-summary").click());
    await act(async () => q("upload-set-as-is").click());
    for (const side of sideNames) expect(field(side).value).toBe("");
    expect((q("upload-set-badge-section") as HTMLDetailsElement).open).toBe(true);
  });
});

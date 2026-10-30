import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadSettingsDialog, { type UploadSettingsDialogProps } from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, ui: Root, props: UploadSettingsDialogProps;
const groups = [["badge", "Badge"], ["sizeguide", "Size guide"], ["shadow", "Shadow"]] as const;
const el = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const section = (name: string) => el(`upload-set-${name}-section`) as HTMLDetailsElement;
const summary = (name: string) => el(`upload-set-${name}-summary`);
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
async function render(patch: Partial<UploadSettingsDialogProps> = {}) {
  props = { ...props, ...patch };
  await act(async () => ui.render(<UploadSettingsDialog {...props} />));
}
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host);
  props = {
    id: null, scope: null, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {}, selectedCount: 2,
    selectedShadow: { state: "mixed", width: null, gap: null }, selectedBadge: { state: "mixed" }, selectedSizeGuide: { state: "mixed" },
    onSelectedShadowToggle: vi.fn(), onSelectedShadowDimensions: vi.fn(), onSelectedBadgeToggle: vi.fn(), onSelectedSizeGuideToggle: vi.fn(),
    onApplyLocal: vi.fn(), onDefaults: vi.fn(), onOverride: vi.fn(), onResetOverride: vi.fn(), onClose: vi.fn(),
  };
});
afterEach(async () => { await act(async () => ui.unmount()); host.remove(); });
function expectNoChanges() {
  for (const callback of [props.onDefaults, props.onOverride, props.onSelectedShadowToggle, props.onSelectedShadowDimensions,
    props.onSelectedBadgeToggle, props.onSelectedSizeGuideToggle, props.onResetOverride, props.onApplyLocal, props.onClose]) {
    expect(callback).not.toHaveBeenCalled();
  }
}

describe.each(["global", "per-icon"])("collapsible decoration groups — %s popup", (scope) => {
  async function mount() {
    await render(scope === "per-icon" ? { id: "one", scope: "one.svg" } : {});
  }
  it("starts all three native disclosures collapsed with visible named summaries", async () => {
    await mount();
    for (const [name, label] of groups) {
      expect(section(name).tagName).toBe("DETAILS");
      expect(section(name).open).toBe(false);
      expect(summary(name).tagName).toBe("SUMMARY");
      expect(summary(name).textContent).toBe(label);
      expect(section(name).firstElementChild).toBe(summary(name));
    }
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expectNoChanges();
  });
  it.each(groups)("%s opens/closes independently, retaining controls and settings", async (name) => {
    await mount();
    const before = [...section(name).querySelectorAll("input,select,button")];
    await click(summary(name));
    expect(section(name).open).toBe(true);
    for (const [other] of groups.filter(([key]) => key !== name)) expect(section(other).open).toBe(false);
    await render({ selectedCount: 153 });
    expect(section(name).open).toBe(true); // ordinary settings/selection rerenders cannot fold it
    await click(summary(name));
    expect(section(name).open).toBe(false);
    expect([...section(name).querySelectorAll("input,select,button")]).toEqual(before);
    expectNoChanges();
  });
  it("allows multiple groups open and preserves existing checkbox actions", async () => {
    await mount();
    for (const [name] of groups) { await click(summary(name)); expect(section(name).open).toBe(true); }
    for (const [name] of groups) {
      const toggle = el(`upload-set-${name}${scope === "global" ? "-selected" : ""}`) as HTMLInputElement;
      expect(toggle.indeterminate).toBe(scope === "global");
      await click(toggle);
    }
    if (scope === "global") {
      expect(props.onSelectedBadgeToggle).toHaveBeenCalledOnce();
      expect(props.onSelectedSizeGuideToggle).toHaveBeenCalledOnce();
      expect(props.onSelectedShadowToggle).toHaveBeenCalledOnce();
      expect(props.onDefaults).not.toHaveBeenCalled(); expect(props.onOverride).not.toHaveBeenCalled();
    } else {
      for (const field of ["badgeEnabled", "sizeGuideEnabled", "shadowEnabled"]) {
        expect(props.onOverride).toHaveBeenCalledWith("one", { [field]: true });
      }
      expect(props.onDefaults).not.toHaveBeenCalled();
    }
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

it("retains a number draft while folded, and preserves the normal blur commit", async () => {
  await render(); await click(summary("shadow"));
  const input = el("upload-set-shadow-width") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "125");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(summary("shadow")); await render({ selectedCount: 3 }); await click(summary("shadow"));
  expect(el("upload-set-shadow-width")).toBe(input);
  expect(input.value).toBe("125"); expectNoChanges();
  await act(async () => { input.focus(); input.blur(); });
  expect(props.onDefaults).toHaveBeenCalledExactlyOnceWith({ shadowWidthPct: 125 });
  expect(props.onSelectedShadowToggle).not.toHaveBeenCalled();
});

it("starts a newly mounted popup collapsed and keeps the parent Close action", async () => {
  await render(); await click(summary("badge"));
  await click(el("upload-set-close")); expect(props.onClose).toHaveBeenCalledOnce();
  await act(async () => ui.render(null)); await render();
  for (const [name] of groups) expect(section(name).open).toBe(false);
});

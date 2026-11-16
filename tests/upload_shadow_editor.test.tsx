// upload_shadow_editor.test.tsx — the Shadow SVG template editor (2026-11-08): the badge's
// "Edit SVG template…" for the shadow. Same behaviour, same dialog component, shadow ids.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UploadSettingsDialog, { type UploadSettingsDialogProps } from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { DEFAULT_SHADOW_TEMPLATE, validateShadowTemplate } from "../src/lib/upload/shadowtemplate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CUSTOM = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><ellipse cx="50" cy="10" rx="50" ry="10" fill="url(#g)" fill-opacity="0.4"/>'
  + '<defs><radialGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#ff0000" stop-opacity="0"/></radialGradient></defs></svg>';
let host: HTMLDivElement, ui: Root, props: UploadSettingsDialogProps;
const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const click = async (id: string) => {
  const element = el(id);
  const folded = element.closest("details:not([open])");
  if (folded) await act(async () => { (folded.querySelector("summary") as HTMLElement).click(); });
  await act(async () => element.click());
};
const code = () => el("upload-shadow-template-code") as HTMLTextAreaElement;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(code(), value);
    code().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(patch: Partial<UploadSettingsDialogProps> = {}) {
  props = { scope: null, id: null, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {},
    selectedShadow: { state: "none", width: null, gap: null }, selectedCount: 0,
    onSelectedShadowToggle: vi.fn(), onSelectedShadowDimensions: vi.fn(),
    selectedBadge: { state: "none" }, onSelectedBadgeToggle: vi.fn(),
    selectedSizeGuide: { state: "none" }, onSelectedSizeGuideToggle: vi.fn(),
    onApplyLocal: vi.fn(), onDefaults: vi.fn(), onOverride: vi.fn(), onResetOverride: vi.fn(), onClose: vi.fn(), ...patch };
  await act(async () => ui.render(<UploadSettingsDialog {...props} />));
}
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host); });
afterEach(async () => { await act(async () => ui.unmount()); host.remove(); });

it("shows the shadow template setting, the bundled default and where it is saved", async () => {
  await mount();
  expect(el("upload-shadow-template-edit").textContent).toContain("Edit SVG template");
  expect(host.textContent).toContain("Shadow SVG template");
  expect(host.textContent).toContain("Default: soft ellipse gradient");
});

it("opens with the bundled source, previews the draft, then applies only the template (never turns the shadow on)", async () => {
  await mount();
  await click("upload-shadow-template-edit");
  expect(code().value).toBe(DEFAULT_SHADOW_TEMPLATE);
  expect(document.activeElement).toBe(code());
  await type(CUSTOM);
  const image = el("upload-shadow-template-preview") as HTMLImageElement;
  expect(decodeURIComponent(image.getAttribute("src")!)).toContain("#ff0000");
  expect(el("upload-shadow-template-valid").textContent).toContain("Valid vector SVG · 100 × 20");
  expect(props.onDefaults).not.toHaveBeenCalled();
  await click("upload-shadow-template-apply");
  const valid = validateShadowTemplate(CUSTOM);
  if (!valid.ok) throw new Error(valid.detail);
  expect(props.onDefaults).toHaveBeenCalledExactlyOnceWith({ shadowTemplateSvg: valid.svg });
  expect(props.onSelectedShadowToggle).not.toHaveBeenCalled();
  expect(props.onOverride).not.toHaveBeenCalled();
  expect(el("upload-shadow-template-dialog")).toBeNull();
  expect(document.getElementById("upload-dialog-title")).not.toBeNull();
});

it("accepts a plain filled path (the user's own code), shows its size and applies it", async () => {
  const PATH = '<svg width="1568" height="133" viewBox="0 0 1568 133" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M783.586 132.874C1216.35 132.874 1567.17 103.129 1567.17 66.4368C1567.17 29.7447 1216.35 0 783.586 0C350.823 0 0 29.7447 0 66.4368C0 103.129 350.823 132.874 783.586 132.874Z" fill="#F5F5F5"/></svg>';
  await mount();
  await click("upload-shadow-template-edit");
  await type(PATH);
  expect(el("upload-shadow-template-valid").textContent).toContain("1568 × 133");
  expect(el("upload-shadow-template-apply").hasAttribute("disabled")).toBe(false);
  await click("upload-shadow-template-apply");
  expect(props.onDefaults).toHaveBeenCalledTimes(1);
  const patch = (props.onDefaults as ReturnType<typeof vi.fn>).mock.calls[0][0] as { shadowTemplateSvg: string };
  expect(patch.shadowTemplateSvg).toContain("#F5F5F5");
});

it("says what to change for code the shadow cannot use, and keeps Apply off", async () => {
  await mount();
  await click("upload-shadow-template-edit");
  const bad: [string, string][] = [
    ["", "Paste"],
    ["<svg", "valid SVG"],
    [CUSTOM.replace("</svg>", "<script>alert(1)</script></svg>"), "Unsupported"],
    [CUSTOM.replace("</svg>", "<text>x</text></svg>"), "Unsupported"],
    [CUSTOM.replace('viewBox="0 0 100 20"', ""), "viewBox"],
    [CUSTOM.replace("<radialGradient", '<radialGradient gradientUnits="userSpaceOnUse" cx="50" cy="10" r="50"'), "bounding-box gradient"],
  ];
  for (const [invalid, words] of bad) {
    await type(invalid);
    expect(el("upload-shadow-template-error").textContent).toContain(words);
    expect(el("upload-shadow-template-apply").hasAttribute("disabled")).toBe(true);
    expect(el("upload-shadow-template-preview")).toBeNull();
  }
  expect(props.onDefaults).not.toHaveBeenCalled();
  await click("upload-shadow-template-cancel");
  expect(el("upload-shadow-template-dialog")).toBeNull();
});

it("in an icon's scope the template is a local pin; Restore default pins the empty (bundled) choice; Cancel/Escape/backdrop discard", async () => {
  await mount({ id: "one", scope: "one.svg", overrides: { shadowTemplateSvg: CUSTOM, paddingPct: 12 } });
  expect(host.textContent).toContain("Custom SVG");
  for (const action of ["cancel", "escape", "backdrop"]) {
    await click("upload-shadow-template-edit");
    expect(code().value).toBe(CUSTOM);
    await type("<svg broken");
    if (action === "escape") await act(async () => code().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    else await click(`upload-shadow-template-${action}`);
    expect(el("upload-shadow-template-dialog")).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el("upload-shadow-template-edit"));
  }
  expect(props.onOverride).not.toHaveBeenCalled();
  await click("upload-shadow-template-edit"); // editable while the shadow itself is off
  await click("upload-shadow-template-default");
  expect(code().value).toBe(DEFAULT_SHADOW_TEMPLATE);
  await click("upload-shadow-template-apply");
  expect(props.onOverride).toHaveBeenCalledExactlyOnceWith("one", { shadowTemplateSvg: "", paddingPct: 12 });
  expect(props.onDefaults).not.toHaveBeenCalled();
});

it("marks the field overridden or inherited like every other setting", async () => {
  await mount({ id: "one", scope: "one.svg", overrides: { shadowTemplateSvg: CUSTOM } });
  expect(el("upload-set-marker-shadow-template").textContent).toBe("overridden");
  await act(async () => ui.unmount());
  ui = createRoot(host);
  await mount({ id: "one", scope: "one.svg", overrides: {} });
  expect(el("upload-set-marker-shadow-template").textContent).toBe("inherited");
});

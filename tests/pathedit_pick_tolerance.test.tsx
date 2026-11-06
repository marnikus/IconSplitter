// pathedit_pick_tolerance.test.tsx — the click tolerance for picking a shape
// (2026-11-06): a thin line is picked by a single click within N screen pixels,
// N set in Edit settings ("Click tolerance", px, remembered on this device).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorState, pointerDown, pointerUp, type PointerInput } from "../src/lib/pathedit/gesture";
import { IDENTITY } from "../src/lib/pathedit/model";
import { loadObjects } from "../src/lib/pathedit/objects";
import { newSession } from "../src/lib/pathedit/session";
import EditSettingsButton from "../src/svg/EditSettingsButton";
import { EDIT_SETTINGS_KEY, PICK_PX_DEFAULT, forgetEditSettings, getEditSettings } from "../src/svg/editsettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = '<svg><path d="M0 0L100 0"/><path d="M0 50L100 50"/></svg>';
const st0 = () => editorState(newSession(loadObjects(SRC, [IDENTITY, IDENTITY]), [0]));
/** One unit per screen pixel; the click is 15 px below the second line. */
const click = (pickPx?: number) => {
  const input: PointerInput = { p: { x: 50, y: 65 }, ctrl: false, alt: false, shift: false, unitsPerPx: 1, target: null, ...(pickPx === undefined ? {} : { pickPx }) };
  return pointerUp(pointerDown(st0(), input)).session.objects;
};

describe("picking a shape by a single click", () => {
  it("selects within the tolerance and not beyond it", () => {
    expect(click(20)).toEqual([1]);
    expect(click(10)).toEqual([0]);
  });
  it("has a generous default", () => {
    expect(PICK_PX_DEFAULT).toBeGreaterThanOrEqual(12);
    expect(click()).toEqual([0]); // 15 px is beyond the default 14 px
  });
});

describe("Edit settings: Click tolerance", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { localStorage.removeItem(EDIT_SETTINGS_KEY); forgetEditSettings(); host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });

  it("is a px field in the popup, clamped and remembered", async () => {
    await act(async () => { ui.render(<EditSettingsButton />); });
    await act(async () => { (host.querySelector("[data-testid=svg-edit-settings]") as HTMLButtonElement).click(); });
    const field = host.querySelector("[data-testid=svg-edit-pick-px]") as HTMLInputElement;
    expect(field.value).toBe(String(PICK_PX_DEFAULT));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "30");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getEditSettings().pickPx).toBe(30);
    expect(JSON.parse(localStorage.getItem(EDIT_SETTINGS_KEY) ?? "{}").pickPx).toBe(30);
    forgetEditSettings();
    localStorage.setItem(EDIT_SETTINGS_KEY, JSON.stringify({ pickPx: 500 }));
    expect(getEditSettings().pickPx).toBe(40);
  });
});

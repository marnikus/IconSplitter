import { beforeEach, describe, expect, it } from "vitest";
import { IMAGE_EDIT_PREF_KEY, loadImageEditPref, parseImageEditPref, saveImageEditPref } from "../src/svg/imgprefs";

beforeEach(() => localStorage.clear());

describe("icons per image-edit request preference", () => {
  it("defaults to four and round-trips a user-selected positive count", () => {
    expect(loadImageEditPref()).toEqual({ count: 4, warning: false });
    saveImageEditPref(9);
    expect(loadImageEditPref()).toEqual({ count: 9, warning: false });
    expect(JSON.parse(localStorage.getItem(IMAGE_EDIT_PREF_KEY)!)).toEqual({ v: 1, count: 9 });
  });

  it("rejects corrupt, fractional and out-of-bound stored values with one warning", () => {
    for (const junk of [null, {}, { v: 2, count: 4 }, { v: 1, count: 0 }, { v: 1, count: 4.5 }, { v: 1, count: 17 }]) {
      expect(parseImageEditPref(junk)).toBeNull();
    }
    localStorage.setItem(IMAGE_EDIT_PREF_KEY, "{broken");
    expect(loadImageEditPref()).toEqual({ count: 4, warning: true });
  });
});

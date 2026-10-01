// reviewthumb.test.ts — RULE 8: thumbnail zoom slider model.
// Geometry (aspect ratio, no upscaling) + persisted max-height (RULE 13).
import { describe, expect, it } from "vitest";
import {
  THUMB_DEFAULT, THUMB_MAX, THUMB_MIN, THUMB_STORE_KEY,
  clampThumbH, readThumbH, thumbBox, writeThumbH,
} from "../src/lib/reviewthumb";

function fakeStore(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe("slider bounds", () => {
  it("range is 48–240 px with a 128 px default", () => {
    expect(THUMB_MIN).toBe(48);
    expect(THUMB_MAX).toBe(240);
    expect(THUMB_DEFAULT).toBe(128);
  });

  it("clampThumbH keeps in-range values and clamps the edges", () => {
    expect(clampThumbH(128)).toBe(128);
    expect(clampThumbH(47)).toBe(THUMB_MIN);
    expect(clampThumbH(241)).toBe(THUMB_MAX);
    expect(clampThumbH(Number.NaN)).toBe(THUMB_DEFAULT);
  });
});

describe("thumbBox", () => {
  it("preserves the aspect ratio at the requested height", () => {
    expect(thumbBox({ w: 400, h: 200 }, 128)).toEqual({ w: 256, h: 128 });
    expect(thumbBox({ w: 100, h: 200 }, 48)).toEqual({ w: 24, h: 48 });
  });

  it("never upscales past the source pixels", () => {
    expect(thumbBox({ w: 50, h: 25 }, 128)).toEqual({ w: 50, h: 25 });
    expect(thumbBox({ w: 48, h: 48 }, 240)).toEqual({ w: 48, h: 48 });
  });

  it("falls back to a square placeholder while dims are unknown", () => {
    expect(thumbBox(null, 96)).toEqual({ w: 96, h: 96 });
    expect(thumbBox({ w: 0, h: 10 }, 96)).toEqual({ w: 96, h: 96 });
  });
});

describe("persistence", () => {
  it("round-trips the value and clamps on write", () => {
    const store = fakeStore();
    expect(writeThumbH(store, 200)).toBe(200);
    expect(readThumbH(store)).toBe(200);
    writeThumbH(store, 9999);
    expect(readThumbH(store)).toBe(THUMB_MAX);
  });

  it("missing or corrupt values fall back to the default (RULE 13)", () => {
    expect(readThumbH(fakeStore())).toBe(THUMB_DEFAULT);
    expect(readThumbH(fakeStore({ [THUMB_STORE_KEY]: "huge" }))).toBe(THUMB_DEFAULT);
  });

  it("restores the persisted size after restart", () => {
    const store = fakeStore({ [THUMB_STORE_KEY]: "72" });
    expect(readThumbH(store)).toBe(72); // next session reads the same store
  });
});

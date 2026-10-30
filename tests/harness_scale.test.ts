// @vitest-environment node
// Contract for tests/helpers/scale.ts: the default render budget is smaller than
// the historical one, and ICONSPLITTER_TEST_SCALE=full restores every number.
import { afterEach, describe, expect, it } from "vitest";
import { atScale, FULL_SCALE, fullScale, PROFILE_ROWS } from "./helpers/scale";

const previous = process.env.ICONSPLITTER_TEST_SCALE;
afterEach(() => {
  if (previous === undefined) delete process.env.ICONSPLITTER_TEST_SCALE;
  else process.env.ICONSPLITTER_TEST_SCALE = previous;
});

describe("render-scale budget", () => {
  it("runs the profiling fixtures below the historical scale by default", () => {
    delete process.env.ICONSPLITTER_TEST_SCALE;
    expect(fullScale()).toBe(false);
    expect(PROFILE_ROWS).toBeLessThan(FULL_SCALE);
    expect(atScale(FULL_SCALE, PROFILE_ROWS)).toBe(PROFILE_ROWS);
  });

  it("restores the historical numbers when the full scale is requested", () => {
    process.env.ICONSPLITTER_TEST_SCALE = "full";
    expect(fullScale()).toBe(true);
    expect(atScale(FULL_SCALE, PROFILE_ROWS)).toBe(FULL_SCALE);
    expect(atScale(100, 40)).toBe(100);
  });

  it("ignores any other value so a typo can never change the evidence silently", () => {
    process.env.ICONSPLITTER_TEST_SCALE = "ful";
    expect(fullScale()).toBe(false);
    expect(atScale(FULL_SCALE, PROFILE_ROWS)).toBe(PROFILE_ROWS);
  });
});

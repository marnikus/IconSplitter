// fmt.test.ts — RULE 8: formatter edge behaviour.
import { describe, expect, it } from "vitest";
import { fmtBytes, fmtFormat } from "../src/selection/fmt";

describe("fmtBytes", () => {
  it("uses MB above a MiB and KB below", () => {
    expect(fmtBytes(18.6 * 1024 * 1024)).toBe("18.6 MB");
    expect(fmtBytes(512 * 1024)).toBe("512 KB");
    expect(fmtBytes(10)).toBe("1 KB");
  });
});

describe("fmtFormat", () => {
  it("uppercases the extension; ? without one", () => {
    expect(fmtFormat("a.png")).toBe("PNG");
    expect(fmtFormat("a.Jpg")).toBe("JPG");
    expect(fmtFormat("noext")).toBe("?");
  });
});

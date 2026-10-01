// fmt.test.ts — RULE 8: formatter edge behaviour.
import { describe, expect, it } from "vitest";
import { fmtBytes, fmtDate, fmtFormat, fmtTime } from "../src/selection/fmt";

describe("fmtBytes", () => {
  it("uses MB above a MiB and KB below", () => {
    expect(fmtBytes(18.6 * 1024 * 1024)).toBe("18.6 MB");
    expect(fmtBytes(512 * 1024)).toBe("512 KB");
    expect(fmtBytes(10)).toBe("1 KB");
  });
});

describe("fmtDate / fmtTime — V2 row cells", () => {
  const ts = new Date(2026, 8, 28, 9, 5, 0).getTime(); // local 2026-09-28 09:05

  it("formats an ISO-style local date", () => {
    expect(fmtDate(ts)).toBe("2026-09-28");
  });

  it("pads a 24-hour clock time", () => {
    expect(fmtTime(ts)).toBe("09:05");
  });
});

describe("fmtFormat", () => {
  it("uppercases the extension; ? without one", () => {
    expect(fmtFormat("a.png")).toBe("PNG");
    expect(fmtFormat("a.Jpg")).toBe("JPG");
    expect(fmtFormat("noext")).toBe("?");
  });
});

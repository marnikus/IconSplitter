import { describe, expect, it } from "vitest";
import { repairStrokeFrame } from "../src/lib/upload/viewrepair";
import { visibleBounds } from "../src/lib/upload/geom/bounds";
const frame = { minX: 0, minY: 0, width: 64, height: 64 };
const root = (content: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${content}</svg>`, "image/svg+xml").documentElement;
describe("bounded source-frame stroke repair", () => {
  it("distinguishes visible centerlines from stroked paint and leaves the source unchanged", () => {
    const r = root('<path d="M32 0v4" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/>');
    const before = r.outerHTML;
    expect(visibleBounds(r, false)?.bounds.minY).toBe(0);
    expect(visibleBounds(r)?.bounds.minY).toBe(-0.5);
    expect(repairStrokeFrame(r, frame)).toEqual({ minX: 0, minY: -0.5, width: 64, height: 64.5 });
    expect(r.outerHTML).toBe(before);
  });
  it("retains the safety gate for real geometry outside the viewport", () => {
    expect(repairStrokeFrame(root('<rect x="60" y="10" width="20" height="20"/>'), frame)).toEqual(frame);
  });
  it("does not reinterpret a very wide deliberately clipped stroke", () => {
    expect(repairStrokeFrame(root('<path d="M32 0v20" stroke="#000" stroke-width="20"/>'), frame)).toEqual(frame);
  });
  it("handles transforms and non-origin frames using the same geometry traversal", () => {
    const f = { minX: 10, minY: 20, width: 64, height: 64 };
    const r = root('<g transform="translate(10 20)"><path d="M32 0v4" fill="none" stroke="#000" stroke-linecap="round"/></g>');
    expect(repairStrokeFrame(r, f)).toEqual({ minX: 10, minY: 19.5, width: 64, height: 64.5 });
  });
  it("ignores hidden outliers and preserves empty/missing frames", () => {
    const r = root('<rect x="100" y="100" width="20" height="20" display="none"/>');
    expect(repairStrokeFrame(r, frame)).toBe(frame);
    expect(repairStrokeFrame(r, null)).toBeNull();
  });
});

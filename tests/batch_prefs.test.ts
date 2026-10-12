import { describe, expect, it } from "vitest";
import { parseBatchPrefs, DEFAULT_BATCH_PREFS } from "../src/lib/batchprefs";
import { ZOOM_DEFAULT } from "../src/lib/zoom";

describe("batchprefs", () => {
  it("defaults on invalid", () => {
    expect(parseBatchPrefs(null)).toEqual(DEFAULT_BATCH_PREFS);
    expect(parseBatchPrefs({})).toEqual(expect.objectContaining({ thumb: ZOOM_DEFAULT }));
  });

  it("clamps zoom 48-800", () => {
    const p = parseBatchPrefs({ thumb: 10 });
    expect(p.thumb).toBeGreaterThanOrEqual(48);
    const p2 = parseBatchPrefs({ thumb: 2000 });
    expect(p2.thumb).toBeLessThanOrEqual(800);
  });

  it("parses valid filter and sort", () => {
    const raw = {
      thumb: 196,
      filter: { date: { mode: "all" }, status: "processed", search: "fire" },
      sort: { by: "name", dir: "asc" },
    };
    const p = parseBatchPrefs(raw);
    expect(p.thumb).toBe(196);
    expect(p.filter.status).toBe("processed");
    expect(p.sort.by).toBe("name");
  });
});

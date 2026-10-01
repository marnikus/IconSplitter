// TDD cycle R9 — design-driven display helpers: pair token, long/short dates,
// relative time, Windows-style path and the zoom badge.
import { describe, expect, it } from "vitest";
import {
  formatLongDateTime, formatShortDate, pairToken, relativeTime, stampForInput, windowsPath, zoomLabel,
} from "../src/lib/reviewformat";

const at = (y: number, m: number, d: number, h = 8, min = 32, s = 14) =>
  new Date(y, m - 1, d, h, min, s).getTime();

describe("pairToken — 'Decisions persist by stable pair ID' (design)", () => {
  it("is stable, short and prefixed", () => {
    expect(pairToken("campaigns/october/coastal/fog_architecture_042")).toMatch(/^pair_[0-9a-f]{8}$/);
    expect(pairToken("a")).toBe(pairToken("a"));
  });

  it("does not collide for different pairs and folds case", () => {
    expect(pairToken("a/star")).not.toBe(pairToken("a/moon"));
    expect(pairToken("A/Star")).toBe(pairToken("a/star"));
  });
});

describe("date helpers (design copy)", () => {
  it("formats the long form used under the panes", () => {
    expect(formatLongDateTime(at(2026, 10, 1))).toBe("Oct 01, 2026 at 08:32:14");
  });

  it("formats the compact list form", () => {
    expect(formatShortDate(at(2026, 10, 1))).toBe("Oct 01 · 08:32");
  });

  it("formats a datetime-local input value", () => {
    expect(stampForInput(at(2026, 10, 1))).toBe("2026-10-01T08:32");
  });

  it("describes the last rescan relative to now", () => {
    const now = at(2026, 10, 1, 8, 33, 14);
    expect(relativeTime(now - 24_000, now)).toBe("24 seconds ago");
    expect(relativeTime(now - 120_000, now)).toBe("2 minutes ago");
    expect(relativeTime(now - 3_600_000, now)).toBe("1 hour ago");
    expect(relativeTime(now, now)).toBe("just now");
  });
});

describe("paths and zoom badges", () => {
  it("renders the root-relative path with the root folder as drive-like prefix", () => {
    expect(windowsPath("split_output", "campaigns/october/coastal/fog_architecture_042.png"))
      .toBe("split_output\\campaigns\\october\\coastal\\fog_architecture_042.png");
    expect(windowsPath("", "a.png")).toBe("a.png");
  });

  it("labels the sync badge for both zoom modes", () => {
    expect(zoomLabel("fit")).toBe("FIT SYNC");
    expect(zoomLabel("100")).toBe("1:1 SYNC");
  });
});

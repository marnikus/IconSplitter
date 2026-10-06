// log_scroll.test.ts — the ONE auto-scroll rule (feature §2): while the reader
// is at the bottom the log follows the tail; a small slack keeps a wheel tick or
// a rounding error from unpinning it; scrolling up pauses the follow.
import { describe, expect, it } from "vitest";
import { isAtBottom, LOG_BOTTOM_SLACK_PX } from "../src/log/scroll";

describe("isAtBottom — when the log may follow the tail", () => {
  it("is true at the exact bottom and within the slack", () => {
    expect(isAtBottom({ scrollTop: 800, scrollHeight: 1_000, clientHeight: 200 })).toBe(true);
    expect(isAtBottom({ scrollTop: 800 - LOG_BOTTOM_SLACK_PX, scrollHeight: 1_000, clientHeight: 200 })).toBe(true);
    expect(isAtBottom({ scrollTop: 800 - LOG_BOTTOM_SLACK_PX - 1, scrollHeight: 1_000, clientHeight: 200 })).toBe(false);
  });

  it("is true when the content is shorter than the view, or nothing is painted yet", () => {
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 120, clientHeight: 200 })).toBe(true);
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })).toBe(true);
  });

  it("keeps the slack small enough to be imperceptible", () => {
    expect(LOG_BOTTOM_SLACK_PX).toBeGreaterThan(0);
    expect(LOG_BOTTOM_SLACK_PX).toBeLessThanOrEqual(48);
  });
});

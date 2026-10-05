// log_scroll.test.ts — the follow-scroll machine of log-panel.md §4, as plain
// numbers (happy-dom has no layout). Every row of the table is a case.
import { describe, expect, it } from "vitest";
import {
  BOTTOM_EPS, FOLLOWING, appendedSince, atBottom, onAppend, onIntentUp, onJump, onRestore, onUserScroll,
  type Follow, type Geometry,
} from "../src/lib/logscroll";
import { entries } from "./helpers/logfix";

const g = (top: number, height = 1000, client = 200): Geometry => ({ top, height, client });
const paused = (unseen = 0, unseenErrors = 0): Follow => ({ following: false, unseen, unseenErrors });

describe("atBottom", () => {
  it("treats up to 4 px from the end as the bottom, and 5 px as not", () => {
    expect(BOTTOM_EPS).toBe(4);
    expect(atBottom(g(800))).toBe(true);
    expect(atBottom(g(796))).toBe(true);
    expect(atBottom(g(795))).toBe(false);
  });

  it("counts a list with no scrollbar as at the bottom", () => {
    expect(atBottom(g(0, 150, 200))).toBe(true);
    expect(atBottom(g(0, 200, 200))).toBe(true);
  });
});

describe("a scroll event", () => {
  it("pauses following the moment it is not at the bottom", () => {
    expect(onUserScroll(FOLLOWING, g(300))).toEqual({ following: false, unseen: 0, unseenErrors: 0 });
  });

  it("stays following while it is at the bottom", () => {
    expect(onUserScroll(FOLLOWING, g(800))).toEqual(FOLLOWING);
  });

  it("resumes following on return to the bottom and zeroes the counters", () => {
    expect(onUserScroll(paused(7, 2), g(800))).toEqual(FOLLOWING);
  });

  it("keeps a paused state, and its counters, while it is still not at the bottom", () => {
    expect(onUserScroll(paused(7, 2), g(300))).toEqual(paused(7, 2));
  });
});

describe("intent up (wheel up, PageUp, ArrowUp, Home)", () => {
  it("pauses at once, before any scroll event exists", () => {
    expect(onIntentUp(FOLLOWING)).toEqual({ following: false, unseen: 0, unseenErrors: 0 });
  });

  it("changes nothing when already paused", () => {
    expect(onIntentUp(paused(3, 1))).toEqual(paused(3, 1));
  });
});

describe("entries appended", () => {
  it("while following and visible: pin to the bottom, counters stay at zero", () => {
    expect(onAppend(FOLLOWING, ["info", "error"], true)).toEqual({ follow: FOLLOWING, pin: true });
  });

  it("while paused and visible: count them and their errors, never scroll", () => {
    expect(onAppend(paused(1, 0), ["info", "error", "warn"], true)).toEqual({ follow: paused(4, 1), pin: false });
  });

  it("while minimised: the counters grow whether following or paused, and nothing pins", () => {
    expect(onAppend(FOLLOWING, ["error", "info"], false)).toEqual({ follow: { following: true, unseen: 2, unseenErrors: 1 }, pin: false });
    expect(onAppend(paused(5, 1), ["error"], false)).toEqual({ follow: paused(6, 2), pin: false });
  });

  it("an empty append changes nothing", () => {
    expect(onAppend(paused(2, 1), [], true)).toEqual({ follow: paused(2, 1), pin: false });
    expect(onAppend(FOLLOWING, [], true)).toEqual({ follow: FOLLOWING, pin: true });
  });
});

describe("restore after minimising", () => {
  it("following: pin to the bottom and zero what accumulated", () => {
    expect(onRestore({ following: true, unseen: 4, unseenErrors: 1 })).toEqual({ follow: FOLLOWING, pin: true });
  });

  it("paused: keep the position and the counters", () => {
    expect(onRestore(paused(4, 1))).toEqual({ follow: paused(4, 1), pin: false });
  });
});

describe("Jump to latest / End", () => {
  it("returns to following, zeroes the counters and pins", () => {
    expect(onJump()).toEqual({ follow: FOLLOWING, pin: true });
  });
});

describe("FOLLOWING", () => {
  it("is following with nothing unseen, and cannot be altered by a caller", () => {
    expect(FOLLOWING).toEqual({ following: true, unseen: 0, unseenErrors: 0 });
    expect(Object.isFrozen(FOLLOWING)).toBe(true);
  });
});

describe("appendedSince — what the view has not seen", () => {
  const list = entries(5);

  it("is everything for a view that has seen nothing", () => {
    expect(appendedSince(list, null)).toEqual({ added: list, replaced: false });
  });

  it("is what follows the last entry the view saw", () => {
    expect(appendedSince(list, "s1-3").added.map((e) => e.id)).toEqual(["s1-4", "s1-5"]);
    expect(appendedSince(list, "s1-3").replaced).toBe(false);
  });

  it("is nothing when the newest entry was already seen", () => {
    expect(appendedSince(list, "s1-5")).toEqual({ added: [], replaced: false });
  });

  it("says REPLACED when the entry the view saw is gone (the log was cleared), and counts the lot as new", () => {
    expect(appendedSince(entries(2, (i) => ({ id: `s2-${i}` })), "s1-5")).toMatchObject({ replaced: true });
    expect(appendedSince(entries(2, (i) => ({ id: `s2-${i}` })), "s1-5").added).toHaveLength(2);
  });

  it("survives the ring dropping the oldest entries: the last seen one is still there", () => {
    expect(appendedSince(list.slice(2), "s1-3").added.map((e) => e.id)).toEqual(["s1-4", "s1-5"]);
  });
});

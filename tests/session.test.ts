// session.test.ts — RULE 13 / request §1: the persisted session payload is
// validated field by field, stale ids are pruned against what is really on
// disk, and a corrupt payload costs one ignored load — never a blank app.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION, SESSION_VERSION, isPristineReview, parseSession,
  sanitizeReview, serializeSession, type AppSession,
} from "../src/lib/session";
import { THUMB_MAX, THUMB_MIN } from "../src/lib/reviewprefs";

function full(): AppSession {
  const s = structuredClone(DEFAULT_SESSION);
  s.tab = "selectionV2";
  s.sheets = { padding: 12, size: 256, transparent: true };
  s.review = {
    rootName: "split_root", filter: { date: { mode: "month", month: "2026-10" }, status: "approved", search: "fog", pairing: "complete" },
    sort: { by: "name", dir: "asc" }, checked: ["p1", "p2"], selectedId: "p2",
    prefs: { mode: "compare", thumbHeight: 128 }, watcher: false, collapsed: true,
    zoom: "full", sync: false, autoNext: false, scroll: { "v2-rows": 420 },
  };
  return s;
}

describe("round trip", () => {
  it("serialises and re-parses every documented field", () => {
    const s = full();
    expect(parseSession(serializeSession(s))).toEqual(s);
  });

  it("keeps the schema version and a saved-at stamp", () => {
    const parsed = parseSession(serializeSession(full()));
    expect(parsed.v).toBe(SESSION_VERSION);
    expect(typeof parsed.savedAt).toBe("number");
  });

  it("falls back to defaults for null, empty, corrupt and foreign payloads", () => {
    expect(parseSession(null)).toEqual(DEFAULT_SESSION);
    expect(parseSession("")).toEqual(DEFAULT_SESSION);
    expect(parseSession("{oops")).toEqual(DEFAULT_SESSION);
    expect(parseSession(JSON.stringify({ v: 99, tab: "selectionV2" }))).toEqual(DEFAULT_SESSION);
    expect(parseSession(JSON.stringify(["not", "an", "object"]))).toEqual(DEFAULT_SESSION);
  });
});

describe("field validation", () => {
  it("rejects an unknown tab but keeps the rest of the payload usable", () => {
    expect(parseSession(JSON.stringify({ ...full(), tab: "nope" })).tab).toBe("sheets");
  });

  it("clamps the sheets export options into their real ranges", () => {
    const s = parseSession(JSON.stringify({ ...full(), sheets: { padding: 900, size: 999, transparent: "yes" } }));
    expect(s.sheets).toEqual({ padding: 40, size: 512, transparent: false });
  });

  it("accepts the native (auto) size and the documented padding bounds", () => {
    expect(parseSession(JSON.stringify({ ...full(), sheets: { padding: 0, size: 0, transparent: true } })).sheets)
      .toEqual({ padding: 0, size: 0, transparent: true });
  });

  it("repairs a hand-edited filter instead of dropping the whole session", () => {
    const s = parseSession(JSON.stringify({
      ...full(),
      review: { ...full().review, filter: { date: { mode: "custom", from: 5, to: 1 }, status: "bogus", search: 7, pairing: "nope" } },
    }));
    expect(s.review?.filter).toEqual({ date: { mode: "custom", from: 1, to: 5 }, status: "all", search: "", pairing: "all" });
  });

  it("keeps month filters only in the YYYY-MM shape", () => {
    const bad = parseSession(JSON.stringify({ ...full(), review: { ...full().review, filter: { date: { mode: "month", month: 12 } } } }));
    expect(bad.review?.filter.date).toEqual({ mode: "all" });
    const ok = parseSession(JSON.stringify({ ...full(), review: { ...full().review, filter: { date: { mode: "month", month: "2026-03" } } } }));
    expect(ok.review?.filter.date).toEqual({ mode: "month", month: "2026-03" });
  });

  it("clamps the thumbnail zoom and repairs the layout mode", () => {
    const s = parseSession(JSON.stringify({ ...full(), review: { ...full().review, prefs: { mode: "grid", thumbHeight: 9000 } } }));
    expect(s.review?.prefs).toEqual({ mode: "list", thumbHeight: THUMB_MAX });
    const low = parseSession(JSON.stringify({ ...full(), review: { ...full().review, prefs: { thumbHeight: -4 } } }));
    expect(low.review?.prefs.thumbHeight).toBe(THUMB_MIN);
  });

  it("drops non-string ids and non-finite scroll offsets", () => {
    const s = parseSession(JSON.stringify({
      ...full(),
      review: { ...full().review, checked: ["a", 7, null, "b"], selectedId: 9, scroll: { "v2-rows": 10, "sel-list": "x", bad: Infinity } },
    }));
    expect(s.review?.checked).toEqual(["a", "b"]);
    expect(s.review?.selectedId).toBeNull();
    expect(s.review?.scroll).toEqual({ "v2-rows": 10 });
  });

  it("treats a missing review slice as 'no review session yet'", () => {
    expect(parseSession(JSON.stringify({ ...full(), review: null })).review).toBeNull();
    expect(parseSession(JSON.stringify({ ...full(), review: "x" })).review).toBeNull();
  });
});

describe("stale ids (request §1)", () => {
  it("prunes checked rows and the active row that a rescan no longer has", () => {
    const review = full().review!;
    const { review: clean, dropped } = sanitizeReview(review, new Set(["p1"]));
    expect(clean.checked).toEqual(["p1"]);
    expect(clean.selectedId).toBeNull();
    expect(dropped).toBe(2);
  });

  it("keeps everything when every id is still present", () => {
    const review = full().review!;
    const { review: clean, dropped } = sanitizeReview(review, new Set(["p1", "p2"]));
    expect(clean).toEqual(review);
    expect(dropped).toBe(0);
  });
});

describe("restore policy (request §1)", () => {
  it("only restores into a store that no user change has touched yet", () => {
    expect(isPristineReview({ rootName: "", pairCount: 0 })).toBe(true);
    expect(isPristineReview({ rootName: "split_root", pairCount: 0 })).toBe(false);
    expect(isPristineReview({ rootName: "", pairCount: 4 })).toBe(false);
  });
});

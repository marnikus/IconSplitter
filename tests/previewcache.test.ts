// previewcache.test.ts — TDD for the preview's byte-budgeted LRU (design D6/T6).
// Pure logic: URLs are created through an injected factory and revoked through an
// injected revoker, so "exactly once per URL, on every path that drops one" is an
// assertion, not a hope (RULE 20).

import { describe, expect, it } from "vitest";
import { createPreviewCache, type PreviewEntry } from "../src/lib/previewcache";

function harness(budget = 1000) {
  let n = 0;
  const revoked: string[] = [];
  const cache = createPreviewCache({
    budget,
    createUrl: () => `blob:url-${++n}`,
    revokeUrl: (u) => revoked.push(u),
  });
  return { cache, revoked };
}

function entry(key: string, bytes: number, blobs = 1): PreviewEntry {
  return { key, blobs: Array.from({ length: blobs }, () => new Blob([new Uint8Array(bytes)])), count: 3, usedFrac: 0.05 };
}

describe("previewcache — bounded, honest about what it drops", () => {
  it("returns what was put and counts its real bytes", () => {
    const { cache } = harness();
    cache.put(entry("a", 200));
    expect(cache.get("a")?.count).toBe(3);
    expect(cache.get("a")?.urls).toEqual(["blob:url-1"]);
    expect(cache.stats()).toEqual({ items: 1, bytes: 200 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("gives every chunk its own URL and revokes each exactly once when dropped", () => {
    const { cache, revoked } = harness();
    cache.put(entry("a", 300, 3));
    expect(cache.get("a")?.urls).toHaveLength(3);
    cache.drop("a");
    expect(revoked).toEqual(["blob:url-1", "blob:url-2", "blob:url-3"]);
    cache.drop("a"); // dropping twice must revoke twice: exactly once per URL
    expect(revoked).toEqual(["blob:url-1", "blob:url-2", "blob:url-3"]);
  });

  it("evicts the least recently used entry first when the budget is passed", () => {
    const { cache, revoked } = harness(500);
    cache.put(entry("a", 200));
    cache.put(entry("b", 200));
    cache.get("a"); // a is now more recently used than b
    cache.put(entry("c", 200)); // 600 > 500 -> b goes
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.get("b")).toBeUndefined();
    expect(revoked).toHaveLength(1);
  });

  it("never evicts a pinned row while anything unpinned is left", () => {
    const { cache } = harness(400);
    cache.put(entry("pinned", 200));
    cache.pin("pinned", true);
    cache.put(entry("a", 200)); // over budget, but "pinned" may not go
    cache.put(entry("b", 200)); // "a" goes, "pinned" and "b" stay
    expect(cache.has("pinned")).toBe(true);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cache.stats().bytes).toBe(400);
  });

  it("drops the pinned entry only when nothing else can pay for the new one", () => {
    const { cache } = harness(300);
    cache.put(entry("big", 300));
    cache.pin("big", true);
    cache.put(entry("new", 200)); // nothing unpinned exists: the newest wins
    expect(cache.has("new")).toBe(true);
    expect(cache.has("big")).toBe(false);
  });

  it("replaces an entry's own frame without leaking the old URL", () => {
    const { cache, revoked } = harness();
    cache.put(entry("a", 100));
    cache.put(entry("a", 250)); // new settings: same key, new strip
    expect(cache.get("a")?.urls).toEqual(["blob:url-2"]);
    expect(revoked).toEqual(["blob:url-1"]);
    expect(cache.stats()).toEqual({ items: 1, bytes: 250 });
  });

  it("clear() empties the cache and revokes everything (a closed tab leaks nothing)", () => {
    const { cache, revoked } = harness();
    cache.put(entry("a", 100, 2));
    cache.put(entry("b", 100));
    cache.clear();
    expect(cache.stats()).toEqual({ items: 0, bytes: 0 });
    expect(cache.has("a")).toBe(false);
    expect(revoked).toHaveLength(3);
  });

  it("refuses a single strip larger than the whole budget instead of thrashing", () => {
    const { cache } = harness(100);
    expect(cache.put(entry("huge", 400))).toBe("too-big");
    expect(cache.stats()).toEqual({ items: 0, bytes: 0 });
  });
});

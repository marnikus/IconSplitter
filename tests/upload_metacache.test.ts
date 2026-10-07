// upload_metacache.test.ts — CP-15 (merge-report §9): the accepted-metadata
// cache. An answer the model already produced for one source fingerprint must
// survive a reload, must never be served for changed artwork, must never grow
// without limit, and a corrupt payload must cost one ignored load (RULE 13).
// RULE 8: the cache is exercised through its real readers — the row assembly
// reads it, so the assertions are about the row the user sees.
import { beforeEach, describe, expect, it } from "vitest";
import {
  META_CACHE_KEY, META_CACHE_LIMIT, META_CACHE_VERSION, cachedMeta, loadMetaCache,
  needsModelCall, parseMetaCache, rememberMeta, restoredMeta, saveMetaCache,
} from "../src/upload/metacache";
import { MANDATORY_TAGS, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
import { EMPTY_META } from "../src/upload/types";

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];

const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

const HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

beforeEach(() => {
  localStorage.clear();
});

describe("the stored shape", () => {
  it("accepts a well-formed payload and drops every junk entry", () => {
    const parsed = parseMetaCache({
      v: META_CACHE_VERSION,
      cache: {
        [HASH]: { state: "accepted", meta: META },
        "sha256:bad-state": { state: "sideways", meta: META },
        "sha256:bad-meta": { state: "generated", meta: { title: 1, description: "", tags: [] } },
        "sha256:no-tags": { state: "generated", meta: { title: "t", description: "d", tags: "nope" } },
      },
    });
    expect(Object.keys(parsed)).toEqual([HASH]);
  });

  it("a payload from another version, or a non-object, loads as empty (RULE 13)", () => {
    expect(parseMetaCache({ v: 99, cache: { [HASH]: { state: "accepted", meta: META } } })).toEqual({});
    expect(parseMetaCache(null)).toEqual({});
    expect(parseMetaCache("junk")).toEqual({});
  });

  it("a corrupt stored payload never throws and never loads", () => {
    localStorage.setItem(META_CACHE_KEY, "{ not json");
    expect(loadMetaCache()).toEqual({});
    expect(cachedMeta(HASH)).toBeNull();
    expect(cachedMeta(null)).toBeNull();
  });
});

describe("write, read and the bound", () => {
  it("remembers one answer under its fingerprint and reads it back", () => {
    rememberMeta(HASH, { state: "accepted", meta: META });
    expect(cachedMeta(HASH)).toEqual({ state: "accepted", meta: META });
    expect(cachedMeta("sha256:other")).toBeNull();
  });

  it("an empty fingerprint writes nothing (a row whose source could not be read)", () => {
    expect(rememberMeta("", { state: "accepted", meta: META })).toEqual({});
    expect(loadMetaCache()).toEqual({});
  });

  it("never grows past the limit: the OLDEST entries go first", () => {
    const cache: Record<string, { state: "generated"; meta: IconMetadata }> = {};
    for (let i = 0; i < META_CACHE_LIMIT + 5; i++) cache[`sha256:${i}`] = { state: "generated", meta: META };
    saveMetaCache(cache);
    const stored = loadMetaCache();
    expect(Object.keys(stored)).toHaveLength(META_CACHE_LIMIT);
    expect(stored["sha256:0"]).toBeUndefined();
    expect(stored[`sha256:${META_CACHE_LIMIT + 4}`]).toBeDefined();
  });
});

describe("what the row opens with", () => {
  it("an accepted answer comes back accepted; a generated one comes back unaccepted", () => {
    expect(restoredMeta({ state: "accepted", meta: META }).state).toBe("accepted");
    expect(restoredMeta({ state: "generated", meta: META }).state).toBe("generated");
    expect(restoredMeta({ state: "accepted", meta: META }).metadata).toEqual(META);
  });

  it("an answer that no longer passes the policy comes back invalid, never exportable", () => {
    const stale = { ...META, tags: META.tags.slice(0, 3) };
    const restored = restoredMeta({ state: "accepted", meta: stale });
    expect(restored.state).toBe("invalid");
    expect(restored.detail).toContain("no longer passes the policy");
    expect(validateMetadata(restored.metadata as IconMetadata).ok).toBe(false);
  });

  it("no entry is the empty state", () => {
    expect(restoredMeta(null)).toEqual(EMPTY_META);
  });

  it("a restored answer needs no model call; an empty one does (the CP-10 count reads this)", () => {
    expect(needsModelCall(restoredMeta({ state: "accepted", meta: META }))).toBe(false);
    expect(needsModelCall(restoredMeta({ state: "generated", meta: META }))).toBe(false);
    expect(needsModelCall(EMPTY_META)).toBe(true);
    expect(needsModelCall({ ...EMPTY_META, state: "interrupted" })).toBe(true);
    expect(needsModelCall({ ...EMPTY_META, state: "invalid", metadata: META })).toBe(true);
  });
});

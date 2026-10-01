// RULE 8 — status tracking runs for real: reconcile, identity and JSON
// validation execute. Deleting or inverting them fails here.
import { describe, expect, it } from "vitest";
import {
  buildStatus,
  flattenStatuses,
  fnv1aHex,
  groupByStatusFile,
  groupKeyOf,
  parseGroupKey,
  parseStatus,
  reconcileScan,
  sameContent,
  statusGroupOf,
  type FileId,
  type StatusFile,
  type Tracked,
} from "../../src/batch/status";

const NOW = "2026-10-01T07:00:00.000Z";
const id = (relPath: string, size = 10, mtime = 5, hash?: string): FileId => ({ relPath, size, mtime, hash });
const tracked = (relPath: string, state: Tracked["state"] = "unprocessed"): Tracked => ({
  ...id(relPath),
  state,
  lastSeen: NOW,
});

describe("fnv1aHex — content hash", () => {
  it("matches FNV-1a vectors and differs per content", () => {
    expect(fnv1aHex(new Uint8Array([]))).toBe("811c9dc5");
    expect(fnv1aHex(new Uint8Array([97]))).toBe("e40c292c");
    expect(fnv1aHex(new Uint8Array([1, 2, 3]))).toBe(fnv1aHex(new Uint8Array([1, 2, 3])));
    expect(fnv1aHex(new Uint8Array([1, 2, 3]))).not.toBe(fnv1aHex(new Uint8Array([1, 2, 4])));
  });
});

describe("sameContent — size + mtime (+ hash)", () => {
  it("compares size and mtime, hash only when enabled and present", () => {
    expect(sameContent(id("a", 1, 2), id("a", 1, 2), false)).toBe(true);
    expect(sameContent(id("a", 1, 2), id("a", 9, 2), false)).toBe(false);
    expect(sameContent(id("a", 1, 2), id("a", 1, 9), false)).toBe(false);
    expect(sameContent(id("a", 1, 2, "h1"), id("a", 1, 2, "h1"), true)).toBe(true);
    expect(sameContent(id("a", 1, 2, "h1"), id("a", 1, 2, "h2"), true)).toBe(false);
    expect(sameContent(id("a", 1, 2), id("a", 1, 2, "h2"), true)).toBe(true);
  });
});

describe("reconcileScan — added / kept / changed", () => {
  it("marks fresh files unprocessed with added events", () => {
    const r = reconcileScan([], [id("C/icon_AI.png")], { now: NOW, useHash: false });
    expect(r.next).toHaveLength(1);
    expect(r.next[0].state).toBe("unprocessed");
    expect(r.events.added).toHaveLength(1);
  });

  it("keeps terminal states when content is unchanged (resume-safe)", () => {
    const prev = [tracked("C/a_AI.png", "processed"), tracked("C/b_AI.png", "skipped")];
    const r = reconcileScan(prev, [id("C/a_AI.png"), id("C/b_AI.png")], { now: NOW, useHash: false });
    expect(r.next.map((t) => t.state)).toEqual(["processed", "skipped"]);
    expect(r.events).toMatchObject({ added: [], changed: [], moved: [], missing: [], deleted: [] });
  });

  it("marks modified files changed, even when previously processed", () => {
    const r = reconcileScan([tracked("C/a_AI.png", "processed")], [id("C/a_AI.png", 99, 5)], {
      now: NOW,
      useHash: false,
    });
    expect(r.next[0].state).toBe("changed");
    expect(r.next[0].size).toBe(99);
    expect(r.events.changed).toHaveLength(1);
  });
});

describe("reconcileScan — missing / deleted / reappeared / moved", () => {
  it("marks a first miss missing, a second consecutive miss deleted", () => {
    const first = reconcileScan([tracked("C/a_AI.png", "processed")], [], { now: NOW, useHash: false });
    expect(first.next[0].state).toBe("missing");
    expect(first.events.missing).toHaveLength(1);
    const second = reconcileScan(first.next, [], { now: NOW, useHash: false });
    expect(second.next[0].state).toBe("deleted");
    expect(second.events.deleted).toHaveLength(1);
  });

  it("reappeared files become unprocessed again with a note", () => {
    const missing = reconcileScan([tracked("C/a_AI.png")], [], { now: NOW, useHash: false }).next;
    const back = reconcileScan(missing, [id("C/a_AI.png")], { now: NOW, useHash: false });
    expect(back.next[0].state).toBe("unprocessed");
    expect(back.next[0].note).toBe("reappeared");
  });

  it("detects moves by content: old entry deleted, new path unprocessed", () => {
    const r = reconcileScan([tracked("A/f_AI.png", "processed")], [id("B/f_AI.png", 10, 5)], {
      now: NOW,
      useHash: false,
    });
    expect(r.events.moved).toEqual([{ from: "A/f_AI.png", to: "B/f_AI.png" }]);
    expect(r.next).toHaveLength(2);
    expect(r.next.find((t) => t.relPath === "A/f_AI.png")?.state).toBe("deleted");
    expect(r.next.find((t) => t.relPath === "B/f_AI.png")?.state).toBe("unprocessed");
  });

  it("does not match moves when content differs", () => {
    const r = reconcileScan([tracked("A/f_AI.png")], [id("B/g_AI.png", 11, 5)], {
      now: NOW,
      useHash: false,
    });
    expect(r.events.moved).toHaveLength(0);
    expect(r.events.missing).toHaveLength(1);
    expect(r.events.added).toHaveLength(1);
  });
});

describe("buildStatus / parseStatus — JSON round trip (RULE 13)", () => {
  const good = (): StatusFile =>
    buildStatus({ base: "icon", reference: "icon.png", referenceFound: true }, [tracked("C/icon_AI.png")], NOW);

  it("round-trips through JSON", () => {
    expect(parseStatus(JSON.parse(JSON.stringify(good())))).toEqual(good());
  });

  it("rejects corrupt payloads instead of crashing", () => {
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus({ ...good(), version: 2 })).toBeNull();
    expect(parseStatus({ ...good(), base: "" })).toBeNull();
    expect(parseStatus({ ...good(), images: {} })).toBeNull();
    expect(parseStatus({ ...good(), images: [{ ...tracked("x"), state: "bogus" }] })).toBeNull();
    expect(parseStatus({ ...good(), images: [{ ...tracked("x"), size: -1 }] })).toBeNull();
  });
});

describe("statusGroupOf / groupKeyOf / groupByStatusFile / flattenStatuses", () => {
  it("derives the (dir, base) group or null for non-AI names", () => {
    expect(statusGroupOf("Category-A/icon_AI_7.png")).toEqual({ dir: "Category-A", base: "icon" });
    expect(statusGroupOf("icon_AI.png")).toEqual({ dir: "", base: "icon" });
    expect(statusGroupOf("Category-A/icon.png")).toBeNull();
  });

  it("groups tracked images by status file and flattens history back", () => {
    const items = [tracked("A/i_AI.png"), tracked("A/i_AI_2.png"), tracked("B/i_AI.png")];
    const groups = groupByStatusFile(items);
    expect(groups.get(groupKeyOf({ dir: "A", base: "i" }))?.images).toHaveLength(2);
    expect(groups.get(groupKeyOf({ dir: "B", base: "i" }))?.images).toHaveLength(1);
    const byGroup = new Map([["k", buildStatus({ base: "i", reference: "i.png", referenceFound: false }, items, NOW)]]);
    expect(flattenStatuses(byGroup)).toHaveLength(3);
    expect(parseGroupKey(groupKeyOf({ dir: "A", base: "i" }))).toEqual({ dir: "A", base: "i" });
    expect(parseGroupKey("nope")).toBeNull();
  });
});

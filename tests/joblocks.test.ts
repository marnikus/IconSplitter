// @vitest-environment node
import { describe, expect, it } from "vitest";
import { acquireResources, availableJob, releaseResources } from "../src/lib/joblocks";

describe("atomic process leases", () => {
  it("acquires disjoint work and refuses every part of a conflicting group", () => {
    const locks = new Map<string, string>();
    expect(acquireResources(locks, "svg", ["a", "b"])).toBe(true);
    expect(acquireResources(locks, "image", ["c", "b"])).toBe(false);
    expect(locks.has("c")).toBe(false);
    expect(acquireResources(locks, "image", ["c"])).toBe(true);
    expect([...locks]).toEqual([["a", "svg"], ["b", "svg"], ["c", "image"]]);
  });
  it("releases only its owner's keys, including after a newer job acquires a completed row", () => {
    const locks = new Map([["a", "old"], ["b", "old"]]);
    releaseResources(locks, "old", ["a"]);
    expect(acquireResources(locks, "new", ["a"])).toBe(true);
    releaseResources(locks, "old", ["a", "b", "missing"]);
    expect([...locks]).toEqual([["a", "new"]]);
    releaseResources(locks, "new", ["a"]);
    expect(locks.size).toBe(0);
  });
  it("supports empty no-op leases without inventing resources", () => {
    const locks = new Map<string, string>();
    expect(acquireResources(locks, "empty", [])).toBe(true);
    releaseResources(locks, "empty", []);
    expect(locks.size).toBe(0);
  });
});
describe("fair disjoint admission", () => {
  it("takes the first free job, skips a blocked head, but never overtakes an overlapping waiter", () => {
    const first = { ids: ["a", "b"] };
    const second = { ids: ["b", "c"] };
    const independent = { ids: ["d"] };
    expect(availableJob([first, second, independent], () => false)).toBe(first);
    expect(availableJob([first, second, independent], (id) => id === "a")).toBe(independent);
    expect(availableJob([first, second], (id) => id === "a")).toBeNull();
    expect(availableJob([], () => false)).toBeNull();
  });
});

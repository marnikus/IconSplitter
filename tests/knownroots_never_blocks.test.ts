// knownroots_never_blocks.test.ts — restoring a folder's saved path can never
// hold a tab's start (2026-11-26): the lookup compares stored folder handles
// through the browser, and a handle of a disconnected / virtual drive may never
// answer. The restore gives up waiting after a moment (and never throws); the
// lookup goes on and binds the path when it lands.
import { describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";

const gate = vi.hoisted(() => ({ release: (_: unknown) => undefined as void, mode: "hang" as "hang" | "throw" }));
vi.mock("../src/lib/rootstore", () => ({
  lookupRootPath: () => (gate.mode === "throw" ? Promise.reject(new Error("idb")) : new Promise((r) => { gate.release = r; })),
}));

const dir = (name: string) => ({ kind: "directory", name }) as unknown as DirHandleLike;

describe("restoreKnownRoot", () => {
  it("returns within a moment while the lookup hangs, and binds the path when it lands", async () => {
    const { restoreKnownRoot, boundRootPathInfo } = await import("../src/lib/knownroots");
    vi.useFakeTimers();
    const h = dir("_split_output");
    let done = false;
    void restoreKnownRoot(h).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toBe(true);
    gate.release({ path: "F:\\work\\_split_output", how: "copied" });
    await vi.advanceTimersByTimeAsync(10);
    expect(boundRootPathInfo(h).path).toBe("F:\\work\\_split_output");
    vi.useRealTimers();
  });

  it("never throws when the store fails", async () => {
    const { restoreKnownRoot } = await import("../src/lib/knownroots");
    gate.mode = "throw";
    await expect(restoreKnownRoot(dir("x"))).resolves.toBeUndefined();
  });
});

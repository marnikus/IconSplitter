// svg_boot_restore.test.ts — Generate SVG restores the remembered folder after a
// reload (2026-11-26): its name shows and the scan runs even when looking up its
// saved full path fails — a failed lookup only leaves the path unknown.
import { describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";

const folder = { kind: "directory", name: "_split_output" } as DirHandleLike;

vi.mock("../src/batch/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/batch/store")>()),
  loadHandles: vi.fn(async (key: string) => (key === "__svg__" ? { source: folder } : null)),
}));
vi.mock("../src/lib/knownroots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/knownroots")>()),
  restoreKnownRoot: vi.fn(async () => { throw new Error("idb unavailable"); }),
}));

describe("bootSources", () => {
  it("names the folder and scans it even when the path lookup throws", async () => {
    const { bootSources } = await import("../src/svg/scan");
    const refs = { root: { current: null as DirHandleLike | null } };
    const s = { setRootName: vi.fn(), loadAll: vi.fn(), refreshKey: vi.fn() };
    await bootSources(refs as never, s);
    expect(refs.root.current).toBe(folder);
    expect(s.setRootName).toHaveBeenCalledWith("_split_output");
    expect(s.loadAll).toHaveBeenCalledTimes(1);
  });
});

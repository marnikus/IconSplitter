// @vitest-environment happy-dom
// bridge_root_resolve.test.ts — the shared path-finding every tab uses (2026-11-16):
// pick / boot restore / Rescan ask the local helper (ui/bridgeroot.ts) through
// lib/knownroots' resolver; the found path is bound to THAT handle.
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundRootPathInfo, clearKnownRoots, resolveRootPath, restoreKnownRoot, setRootResolver } from "../src/lib/knownroots";
import { findRootViaBridge } from "../src/ui/bridgeroot";
import { retryCapture } from "../src/ui/rootcapture";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const FULL = String.raw`F:\Stocks 2026\icons testing\single\test_process_6`;
let posted: Array<{ name: string; markers: string[] }> = [];
function folder(): FakeDir {
  const d = new FakeDir("test_process_6");
  d.children.set("_split_output", new FakeDir("_split_output"));
  d.children.set("batch_state.json", new FakeFile("batch_state.json", 2, 1, "{}"));
  return d;
}
const helperAnswers = (answer: unknown) => vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
  posted.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(answer));
}));

afterEach(() => { clearKnownRoots(); setRootResolver(null); vi.unstubAllGlobals(); posted = []; });

describe("full path through the local helper", () => {
  it("sends the folder's name and entries; binds the answer to that very handle", async () => {
    helperAnswers({ ok: true, path: FULL });
    const d = folder();
    expect(await findRootViaBridge(d)).toBe(FULL);
    expect(posted[0]).toMatchObject({ name: "test_process_6", markers: expect.arrayContaining(["_split_output", "batch_state.json"]) });
    expect(boundRootPathInfo(d).path).toBe(FULL);
    expect(boundRootPathInfo(folder()).path).toBe(""); // a same-named folder is not it
  });

  it("boot restore and Rescan (every tab's shared paths) use it; no helper → nothing bound", async () => {
    setRootResolver(findRootViaBridge);
    helperAnswers({ ok: true, path: FULL });
    const a = folder();
    await restoreKnownRoot(a);
    await vi.waitFor(() => expect(boundRootPathInfo(a).path).toBe(FULL));
    const b = folder();
    expect(await retryCapture(b)).toContain(FULL);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const c = folder();
    expect(await resolveRootPath(c)).toBeNull();
    expect(boundRootPathInfo(c).path).toBe("");
  });
});

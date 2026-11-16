// @vitest-environment happy-dom
// locate_path.test.ts — every tab's "Location" (2026-11-16, ui/locate.ts): the
// full path is copied (the file's own path for a file), and the local helper
// opens Explorer at it (the file selected). Without the helper, or without the
// folder's captured full path, the path is still copied and the message says why.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { locateFolder, locateSplitFolder } from "../src/ui/locate";
import type { DirHandleLike } from "../src/lib/fs";
import { FakeDir, FakeFile } from "./helpers/fakefs";

// A fake folder with the one file the first test locates (only an existing file is copied / selected).
const food = new FakeDir("food");
food.children.set("apple_AI.svg", new FakeFile("apple_AI.svg", 6, 1, "<svg/>"));
const tree = new FakeDir("icons");
tree.children.set("food", food);
const root = tree as unknown as DirHandleLike;
let copied: string[] = [];
let posts: Array<{ url: string; body: { path: string; select?: string } }> = [];
const said: Array<[string, boolean]> = [];
const say = (m: string, err = false) => { said.push([m, err]); };

beforeEach(() => {
  copied = []; posts = []; said.length = 0;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { copied.push(t); } } });
});
afterEach(() => { clearKnownRoots(); vi.unstubAllGlobals(); });

const helper = (answer: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  posts.push({ url, body: JSON.parse(String(init?.body)) }); return answer();
}));

describe("Location in every tab", () => {
  it("a file: copies its full path and asks the helper to open its folder with the file selected", async () => {
    rememberKnownRoot(root, String.raw`F:\Stocks\icons`);
    helper(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await locateFolder(root, "food/apple_AI.svg", say);
    expect(copied).toEqual([String.raw`F:\Stocks\icons\food\apple_AI.svg`]);
    expect(posts[0].url).toMatch(/\/open-folder$/);
    expect(posts[0].body).toEqual({ path: String.raw`F:\Stocks\icons\food`, select: String.raw`F:\Stocks\icons\food\apple_AI.svg` });
    expect(said.at(-1)![0]).toMatch(/Explorer/);
  });

  it("a folder: copies it and opens it", async () => {
    rememberKnownRoot(root, String.raw`F:\Stocks\icons`);
    helper(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await locateSplitFolder(null, root, "2026-11/2026-11-09/apple/split_01", say);
    expect(copied[0]).toBe(String.raw`F:\Stocks\icons\_split_output\2026-11\2026-11-09\apple\split_01`);
    expect(posts[0].body).toEqual({ path: copied[0] });
  });

  it("no helper: still copied, and the message says the helper is not running", async () => {
    rememberKnownRoot(root, String.raw`F:\Stocks\icons`);
    helper(async () => { throw new TypeError("Failed to fetch"); });
    await locateFolder(root, "food/apple_AI.svg", say);
    expect(copied).toHaveLength(1);
    expect(said.at(-1)![0]).toMatch(/helper is not running/);
  });

  it("the folder's full path unknown: copied as before, nothing sent", async () => {
    helper(async () => new Response("{}"));
    await locateFolder(root, "food/apple_AI.svg", say);
    expect(posts).toHaveLength(0);
    expect(copied).toHaveLength(1);
    expect(said.at(-1)![0]).toMatch(/full path/);
  });
});

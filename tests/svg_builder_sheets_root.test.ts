// @vitest-environment happy-dom
// svg_builder_sheets_root.test.ts — _artboard_sheets sits BESIDE _split_output,
// never inside it (2026-11-16). With _split_output itself open, its parent is
// found among the folders the app already holds (Batch…) — or picked once.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSheetsParent, findSheetsParent, forgetSheetsParent, sheetsRoot, sheetsRootPath, SHEETS_BESIDE_SPLIT } from "../src/svgBuilder/actions/sheetsroot";
import { saveHandles } from "../src/batch/store";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import type { BuilderActionContext } from "../src/svgBuilder/actiontypes";
import { FakeDir } from "./helpers/fakefs";

// The handle store in memory (handles keep their identity, as real ones answer isSameEntry).
const held = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/batch/store")>()),
  saveHandles: vi.fn(async (k: string, h: unknown) => { held.set(k, h); }),
  loadHandles: vi.fn(async (k: string) => held.get(k) ?? null),
  idbGetAll: vi.fn(async () => [...held.values()]),
}));

const ctxOf = (root: FakeDir | null, said: string[]) =>
  ({ model: { root }, say: (m: string) => { said.push(m); } }) as unknown as BuilderActionContext;

function tree(): { picked: FakeDir; split: FakeDir } {
  const picked = new FakeDir("Picked");
  const split = new FakeDir("_split_output");
  picked.children.set("_split_output", split);
  return { picked, split };
}

beforeEach(async () => { held.clear(); forgetSheetsParent(); clearKnownRoots(); });

describe("where _artboard_sheets is written", () => {
  it("the open folder when it holds _split_output; nothing (and a message) when it IS _split_output with no parent known", () => {
    const said: string[] = [];
    const picked = new FakeDir("Picked");
    expect(sheetsRoot(ctxOf(picked, said))).toBe(picked);
    expect(sheetsRoot(ctxOf(new FakeDir("_split_output"), said))).toBeNull();
    expect(said).toEqual([SHEETS_BESIDE_SPLIT]);
  });

  it("_split_output open: its parent is found among the folders Batch holds, with its full path", async () => {
    const { picked, split } = tree();
    rememberKnownRoot(split, String.raw`F:\Stocks\Picked\_split_output`);
    await saveHandles("My preset", { source: picked });
    expect(await findSheetsParent(split)).toBe(true);
    const ctx = ctxOf(split, []);
    expect(sheetsRoot(ctx)).toBe(picked);
    expect(sheetsRootPath(ctx)).toBe(String.raw`F:\Stocks\Picked`);
  });

  it("no folder held holds it: Location asks the user to pick it once, and checks it really holds the open _split_output", async () => {
    const { picked, split } = tree();
    const w = window as unknown as { showDirectoryPicker?: unknown };
    w.showDirectoryPicker = vi.fn(async () => new FakeDir("Elsewhere"));
    const said: string[] = [];
    expect(await ensureSheetsParent(ctxOf(split, said))).toBe(false);
    expect(said.at(-1)).toMatch(/no _split_output/);
    w.showDirectoryPicker = vi.fn(async () => picked);
    expect(await ensureSheetsParent(ctxOf(split, said))).toBe(true);
    expect(sheetsRoot(ctxOf(split, said))).toBe(picked);
    forgetSheetsParent();
    expect(await findSheetsParent(split)).toBe(true); // remembered for next time
  });
});

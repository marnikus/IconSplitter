// svg_builder_sheets_root.test.ts — _artboard_sheets sits BESIDE _split_output,
// never inside it (2026-11-16): with _split_output itself open nothing is written.
import { describe, expect, it } from "vitest";
import { sheetsRoot, SHEETS_BESIDE_SPLIT } from "../src/svgBuilder/actions/sheetsroot";
import type { BuilderActionContext } from "../src/svgBuilder/actiontypes";
import { FakeDir } from "./helpers/fakefs";

const ctxOf = (root: FakeDir | null, said: string[]) =>
  ({ model: { root }, say: (m: string) => { said.push(m); } }) as unknown as BuilderActionContext;

describe("where _artboard_sheets is written", () => {
  it("the open folder when it holds _split_output; nothing (and a message) when it IS _split_output", () => {
    const said: string[] = [];
    const picked = new FakeDir("Picked");
    expect(sheetsRoot(ctxOf(picked, said))).toBe(picked);
    expect(sheetsRoot(ctxOf(new FakeDir("_split_output"), said))).toBeNull();
    expect(said).toEqual([SHEETS_BESIDE_SPLIT]);
    expect(sheetsRoot(ctxOf(new FakeDir("_split_output"), said), true)).toBeNull();
    expect(said).toHaveLength(1);
  });
});

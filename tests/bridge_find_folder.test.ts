// bridge_find_folder.test.ts — the helper finds a picked folder's full path
// (2026-11-16): the folder with that name holding every marker entry.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findFolder } from "../tools/bridge/findfolder.mjs";

describe("find-folder", () => {
  it("finds the folder by name AND its entries; a same-named folder without them is passed over", () => {
    const top = mkdtempSync(path.join(os.tmpdir(), "find-"));
    const decoy = path.join(top, "a", "test_process_6");
    const real = path.join(top, "b", "deep", "test_process_6");
    mkdirSync(decoy, { recursive: true });
    mkdirSync(path.join(real, "_split_output"), { recursive: true });
    writeFileSync(path.join(real, "batch_state.json"), "{}");
    const out = findFolder({ name: "test_process_6", markers: ["_split_output", "batch_state.json"] }, { starts: [top] });
    expect(out).toEqual({ ok: true, path: real });
    expect(findFolder({ name: "nope", markers: ["x"] }, { starts: [top] }).ok).toBe(false);
    expect(findFolder({ name: "", markers: [] }).ok).toBe(false);
  });
});

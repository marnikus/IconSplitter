import { describe, expect, it } from "vitest";
import { readStockRecord } from "../src/lib/stockupload/record";
import { scanStockExports } from "../src/lib/stockupload/discovery";
import { makeTransferPlan } from "../src/lib/stockupload/plan";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { sha256Hex } from "../src/lib/upload/hash";

import { rawRecord } from "./helpers/stockrecord";

describe("stock exported-only inventory", () => {
  it("accepts committed declarations and rebases only onto their containing export folder", () => {
    expect(readStockRecord(rawRecord(), "pair/export")?.artifacts[0].path).toBe("pair/export/flag.jpg");
    expect(readStockRecord(rawRecord(), "")?.artifacts[0].path).toBe("flag.jpg");
    for (const path of ["../export/flag.jpg", "else/flag.jpg", "file:///export/flag.jpg", "a/export/../flag.jpg", "a/export/flag%2f.jpg"]) {
      const raw = rawRecord(); raw.outputs.jpg.path = path;
      expect(readStockRecord(raw, "pair/export")).toBeNull();
    }
  });
  it("refuses corrupt/uncommitted records and never guesses artifacts", () => {
    expect(readStockRecord({ ...rawRecord(), stage: "prepare" }, "export")).toBeNull();
    expect(readStockRecord({ ...rawRecord(), validation: {} }, "export")).toBeNull();
    expect(readStockRecord({ ...rawRecord(), outputs: {} }, "export")).toBeNull();
    expect(readStockRecord(null, "export")).toBeNull();
  });
  it("scans only record AND export AND existing verified disk output, without source SVG", async () => {
    const root = new BinDir("root"), folder = new BinDir("export"); root.children.set("export", folder);
    const bytes = new Uint8Array([255, 216, 255]);
    folder.children.set("flag.jpg", new BinFile("flag.jpg", bytes));
    folder.children.set("orphan.png", new BinFile("orphan.png", "orphan"));
    folder.children.set("export.json", new BinFile("export.json", JSON.stringify(rawRecord(await sha256Hex(bytes)))));
    const found = await scanStockExports(root);
    expect(found.rows).toHaveLength(1); expect(found.rows[0].artifacts.map(a => a.name)).toEqual(["flag.jpg"]);
    expect((await scanStockExports(folder)).rows).toHaveLength(1);
    folder.children.set("flag.jpg", new BinFile("flag.jpg", "changed"));
    expect((await scanStockExports(root)).rows).toHaveLength(0);
  });
  it("builds exact compatible plans, blocks collisions and requires explicit EPS review", () => {
    const row = readStockRecord(rawRecord(), "pair/export")!;
    const plan = makeTransferPlan([row], { raster: true, svg: true, eps: true, zip: true }, false);
    expect(plan.files).toHaveLength(1); expect(plan.files[0].name).toBe("flag.jpg");
    expect(() => makeTransferPlan([row, { ...row, id: "other" }], { raster: true, svg: false, eps: false, zip: false }, false)).toThrow(/collision/);
  });
});

it("retains the JSON/disk intersection when another declared format is missing", async () => {
  const folder = new BinDir("export"), bytes = new Uint8Array([255, 216, 255]);
  const raw: Record<string, unknown> = rawRecord(await sha256Hex(bytes));
  (raw.outputs as Record<string, unknown>).eps = { path: "old/export/flag.eps", bytes: 3, hash: "a".repeat(64) };
  folder.children.set("export.json", new BinFile("export.json", JSON.stringify(raw))); folder.children.set("flag.jpg", new BinFile("flag.jpg", bytes));
  const found = await scanStockExports(folder); expect(found.rows[0].artifacts.map(a => a.kind)).toEqual(["jpg"]); expect(found.errors[0]).toContain("flag.eps");
});

it("sorts independently found packages and isolates an unreadable sibling", async () => {
  const root = new BinDir("root"), bytes = new Uint8Array([255, 216, 255]), text = JSON.stringify(rawRecord(await sha256Hex(bytes)));
  for (const name of ["b", "a"]) {
    const parent = new BinDir(name), folder = new BinDir("export"); parent.children.set("export", folder); root.children.set(name, parent);
    folder.children.set("export.json", new BinFile("export.json", text)); folder.children.set("flag.jpg", new BinFile("flag.jpg", bytes));
  }
  const bad = new BinDir("locked"); bad.entries = () => { throw new Error("unreadable directory"); }; root.children.set("locked", bad);
  const found = await scanStockExports(root); expect(found.rows.map(r => r.dir)).toEqual(["a/export", "b/export"]); expect(found.errors).toContain("/locked: directory unreadable");
});

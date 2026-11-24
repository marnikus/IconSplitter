// @vitest-environment happy-dom
// svg_builder_export_speed_units.test.ts — TDD unit & stage contracts for the
// >= 80% SVG builder export speedup (docs/current/sor/svg-builder-export-speed.md).
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { clearSanitizedIcons } from "../src/lib/svgBuilder/svgAsset";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { artboardConfig, newArtboard } from "../src/lib/svgBuilder/artboards";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { builtinConverter } from "../src/lib/upload/epsconv/builtin";
import { verifyEps, writeEps } from "../src/lib/upload/eps";
import * as epsScene from "../src/lib/upload/epsscene";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { writeSheetExport } from "../src/svgBuilder/sheetwriter";
import { recordUse, recordUseBatch } from "../src/svgBuilder/usagestore";
import { fitStemToDir } from "../src/upload/renameexport";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";
import { BinDir, BinFile } from "./helpers/binfakefs";

afterEach(() => {
  setTextOutliner(null);
  vi.restoreAllMocks();
});

function makeMultiPathSvg(i: number): string {
  const paths: string[] = [];
  for (let p = 0; p < 12; p += 1) {
    const y = 8 + p * 3.8 + (i % 5) * 0.2;
    paths.push(
      `<path d="M10 ${y.toFixed(2)} C18 ${(y - 4).toFixed(2)} 28 ${(y + 4).toFixed(2)} 36 ${y.toFixed(2)} C44 ${(y - 3).toFixed(2)} 50 ${(y + 3).toFixed(2)} 56 ${y.toFixed(2)}" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><g>${paths.join("")}</g></svg>`;
}

describe("SVG builder export speed — unit & stage contracts", () => {
  it("fitStemToDir performs zero FS probes when desired === workName and zero writable streams on MAX_PATH shrink", async () => {
    const dir = new BinDir("export");
    let fileOps = 0;
    let writableOpens = 0;
    let removes = 0;
    const origGetFile = dir.getFileHandle.bind(dir);
    dir.getFileHandle = async (name, opts) => {
      fileOps += 1;
      if (opts?.create && name.length > 42) throw new Error("MAX_PATH exceeded");
      const fh = await origGetFile(name, opts);
      const origCreate = fh.createWritable.bind(fh);
      fh.createWritable = async () => {
        writableOpens += 1;
        return origCreate();
      };
      return fh;
    };
    const origRemove = dir.removeEntry.bind(dir);
    dir.removeEntry = async (name, opts) => {
      removes += 1;
      return origRemove(name, opts);
    };

    const same = await fitStemToDir(dir, "sheet_work_v1", "sheet_work_v1");
    expect(same).toBe("sheet_work_v1");
    expect(fileOps).toBe(0);
    expect(writableOpens).toBe(0);
    expect(removes).toBe(0);

    const shrunk = await fitStemToDir(
      dir,
      "Set_of_assorted_cafe_food_icons_with_drinks_and_bakery_items",
      "sheet_work_v1",
    );
    expect(shrunk.length).toBeLessThanOrEqual(37);
    expect(shrunk.endsWith("_")).toBe(false);
    expect(writableOpens).toBe(0);
  });

  it("writeSheetExport writes sibling artifacts concurrently and commits export.json strictly last (RULE 23)", async () => {
    const root = new BinDir("root");
    const order: string[] = [];
    let activeArtifactWrites = 0;
    let maxConcurrentArtifactWrites = 0;
    const wrapDir = (d: BinDir): BinDir => {
      const origSub = d.getDirectoryHandle.bind(d);
      d.getDirectoryHandle = async (name, opts) => wrapDir(await origSub(name, opts));
      const origFile = d.getFileHandle.bind(d);
      d.getFileHandle = async (fname, fopts) => {
        const fh = await origFile(fname, fopts);
        const origW = fh.createWritable.bind(fh);
        fh.createWritable = async () => {
          const w = await origW();
          const origClose = w.close.bind(w);
          w.close = async () => {
            if (fname !== "export.json") {
              activeArtifactWrites += 1;
              maxConcurrentArtifactWrites = Math.max(maxConcurrentArtifactWrites, activeArtifactWrites);
              await new Promise((r) => setTimeout(r, 5));
              activeArtifactWrites -= 1;
            }
            order.push(fname);
            return origClose();
          };
          return w;
        };
        return fh;
      };
      return d;
    };
    wrapDir(root);

    const enc = (s: string) => new TextEncoder().encode(s);
    await writeSheetExport(root, "sheet_a", [
      { name: "sheet.svg", bytes: enc("<svg/>") },
      { name: "sheet.png", bytes: enc("png") },
      { name: "sheet.eps", bytes: enc("%!PS") },
      { name: "export.json", bytes: enc("{}") },
    ]);
    expect(order[order.length - 1]).toBe("export.json");
    expect(maxConcurrentArtifactWrites).toBe(3);
  });

  it("recordUseBatch coalesces multi-artboard icon increments into one read and one write per unique icon", async () => {
    const root = new BinDir("Picked");
    const assets: BuilderIconAsset[] = Array.from({ length: 6 }, (_, i) => {
      const stem = `icon_${i}`;
      const sub = new BinDir(stem);
      root.children.set(stem, sub);
      sub.children.set(`${stem}.svg`, new BinFile(`${stem}.svg`, "<svg/>", 100));
      return {
        id: `id_${i}`, base: stem, suffix: "", label: stem, category: "c", tags: [],
        svgPath: `${stem}/${stem}.svg`, svgName: `${stem}.svg`, version: 1, fingerprint: `fp_${i}`,
        metaPath: `${stem}/${stem}.svg.json`, approved: true as const,
      };
    });

    let writes = 0;
    for (const sub of root.children.values()) {
      if (!(sub instanceof BinDir)) continue;
      const origGet = sub.getFileHandle.bind(sub);
      sub.getFileHandle = async (name, opts) => {
        const fh = await origGet(name, opts);
        if (opts?.create) {
          const origW = fh.createWritable.bind(fh);
          fh.createWritable = async () => {
            writes += 1;
            return origW();
          };
        }
        return fh;
      };
    }

    const res = await recordUseBatch(root, assets, [
      { ids: ["id_0", "id_1", "id_2"], artboard: "art-1 Sheet 1", at: "2026-11-19T01:00:00Z" },
      { ids: ["id_0", "id_2", "id_3"], artboard: "art-2 Sheet 2", at: "2026-11-19T01:00:01Z" },
      { ids: ["id_0", "id_4", "id_5"], artboard: "art-3 Sheet 3", at: "2026-11-19T01:00:02Z" },
    ]);

    expect(res.failed).toEqual([]);
    // 6 distinct icons across 3 artboards => exactly 6 writes instead of 9 sequential writes!
    expect(writes).toBe(6);
    expect(res.records.get("id_0")?.used).toBe(3);
    expect(res.records.get("id_0")?.last).toBe("2026-11-19T01:00:02Z");
    expect(res.records.get("id_0")?.history.map((h) => h.artboard)).toEqual([
      "art-3 Sheet 3",
      "art-2 Sheet 2",
      "art-1 Sheet 1",
    ]);

    // Single-sheet recordUse stays 100% compatible:
    const single = await recordUse({
      root, assets, ids: ["id_0"], artboard: "art-4 Sheet 4", at: "2026-11-19T01:00:03Z",
    });
    expect(single.records.get("id_0")?.used).toBe(4);
  });

  it("writeEps skips recordPaint on solid/opaque sheets while preserving semi-transparent gradient backdrop checks", () => {
    const spy = vi.spyOn(epsScene, "recordPaint");
    const solidSheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
      <rect width="200" height="100" fill="#FFFFFF"/>
      <path d="M10 10 C20 5 40 15 50 10" fill="none" stroke="#112233" stroke-width="2"/>
      <circle cx="100" cy="50" r="20" fill="#224466"/>
    </svg>`;
    const solidOut = writeEps(solidSheet, "#FFFFFF", {});
    expect(solidOut.ok).toBe(true);
    if (solidOut.ok) expect(verifyEps(solidOut.eps).ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();

    const gradSheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
      <defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
      <rect width="200" height="100" fill="#FFFFFF"/>
      <ellipse cx="100" cy="50" rx="40" ry="12" fill="url(#g)" fill-opacity="0.4"/>
    </svg>`;
    const gradOut = writeEps(gradSheet, "#FFFFFF", {});
    expect(gradOut.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it("cuts full-stock buildSheetPackage CPU time by >= 80% (<= 220 ms/sheet vs ~1,088 ms baseline) with clean RULE 26 outputs", async () => {
    const assets: BuilderIconAsset[] = Array.from({ length: 24 }, (_, i) => ({
      id: `p_${i}`, base: `food_${i}`, suffix: "_AI", label: `Food ${i}`, category: "food",
      tags: ["food"], svgPath: `food_${i}/food_${i}_AI.svg`, svgName: `food_${i}_AI.svg`,
      version: 1, fingerprint: `fp_${i}`, metaPath: `food_${i}.json`, approved: true as const,
    }));
    const texts = Object.fromEntries(assets.map((a, i) => [a.id, makeMultiPathSvg(i)]));
    const cfg = {
      ...DEFAULT_CONFIG,
      grid: { ...DEFAULT_CONFIG.grid, columns: 6, rows: 4, captions: true },
      banner: { ...DEFAULT_CONFIG.banner, position: "right" as const, layout: "split" as const },
    };
    const tpl = newTemplate(cfg, [], "2026-11-19T00:00:00Z", "tpl-bench");
    const ab = newArtboard(tpl, [], { id: "art-1", now: "2026-11-19T00:00:00Z", placedIds: assets.map((a) => a.id) });
    const ac = artboardConfig(tpl, ab);

    clearSanitizedIcons();
    const composed = composeSheet({ config: ac, layout: computeLayout(ac), assets, placedIds: ab.placedIds, svgTexts: texts, metadata: null });
    setTextOutliner((run) => ({ d: `M0 0 L${run.value.length * 6} 0 L${run.value.length * 6} -10 L0 -10 Z`, width: run.value.length * 6 }));

    const settings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      includeSvg: true, includeJpeg: true, includeEps: true, epsConverter: "builtin" as const,
      optimizeSvg: true, cleanExport: true, expandStrokes: true, expandText: true, rescaleArtboard: true,
    };
    const deps = {
      pngBlob: async () => new Blob(["png"], { type: "image/png" }),
      eps: (inp: Parameters<typeof builtinConverter.convert>[0]) =>
        builtinConverter.convert(inp, { bridgeUrl: "", fetch: async () => new Response("") }),
    };

    // Warm JIT once, then measure median over 3 sheets (immune to single-iteration GC/worker jitter):
    await buildSheetPackage({ svg: composed.svg, metadata: null, settings, folder: "f", stem: "s", pairId: "art-1", now: "2026-11-19T00:00:00Z", prompt: "", model: "" }, deps);
    const samples: number[] = [];
    let lastPkg!: Awaited<ReturnType<typeof buildSheetPackage>>;
    for (let k = 0; k < 3; k += 1) {
      const t0 = performance.now();
      lastPkg = await buildSheetPackage({ svg: composed.svg, metadata: null, settings, folder: "f", stem: `s_${k}`, pairId: "art-1", now: "2026-11-19T00:00:00Z", prompt: "", model: "" }, deps);
      samples.push(performance.now() - t0);
    }
    const perSheetMs = [...samples].sort((a, b) => a - b)[1];
    // Istanbul `--coverage` instruments every charCode/Bezier statement in `src/lib/**` (`tools/verify.mjs` sets `PERF_BUDGETS=coverage`).
    const coverageRun = process.env.PERF_BUDGETS === "coverage";
    // Baseline was ~1,088 ms/sheet (12,797 ms with EPS regex); >= 80% cut means <= 217 ms/sheet uninstrumented!
    expect(perSheetMs).toBeLessThanOrEqual(coverageRun ? 540 : 217);
    expect(lastPkg.problems).toEqual([]);
    const svgOut = new TextDecoder().decode(lastPkg.files.find((f) => f.name.endsWith(".svg"))!.bytes);
    const epsOut = new TextDecoder().decode(lastPkg.files.find((f) => f.name.endsWith(".eps"))!.bytes);
    expect(svgOut).not.toContain("data-");
    expect(svgOut).not.toContain("currentColor");
    expect(svgOut).not.toContain("<text");
    expect(svgOut).not.toContain("stroke-width");
    expect(svgOut).not.toMatch(/\.\d{2,}/); // <= 1 decimal place (RULE 26)
    expect(verifyEps(epsOut).ok).toBe(true);
  });
});

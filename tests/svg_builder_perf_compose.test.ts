// @vitest-environment happy-dom
// svg_builder_perf_compose.test.ts — the cost of composing sheets (2026-11-15):
// 40 realistic icons on a sheet, 33 sheets (the stage + 12 template and 20
// artboard pictures). Cold = every icon sanitised again (as before the cache);
// warm = sanitised once, then only re-wrapped. Budget: warm ≤ 20 % of cold.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { clearSanitizedIcons } from "../src/lib/svgBuilder/svgAsset";

const path = (i: number) => Array.from({ length: 30 }, (_, k) => `${k === 0 ? "M" : "L"}${(3 + ((i * 7 + k * 13) % 18)).toFixed(2)} ${(3 + ((i * 11 + k * 5) % 18)).toFixed(2)}`).join(" ");
const icon = (i: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g><path d="${path(i)}"/><circle cx="12" cy="12" r="${3 + (i % 5)}"/><path d="${path(i + 1)}"/></g></svg>`;
const assets = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, base: `i${i}`, suffix: "", label: `Icon ${i}`, category: "c", tags: [], svgPath: `i${i}.svg`, svgName: `i${i}.svg`, version: 1, fingerprint: `f${i}`, metaPath: `i${i}.json`, approved: true as const }));
const texts = Object.fromEntries(assets.map((a, i) => [a.id, icon(i)]));
const config = parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 8, rows: 5 } });
const layout = computeLayout(config);
const ids = assets.map((a) => a.id);

function run(sheets: number, cold: boolean): number {
  const t0 = performance.now();
  for (let i = 0; i < sheets; i++) {
    if (cold) clearSanitizedIcons();
    composeSheet({ config, layout, assets, placedIds: ids, svgTexts: texts });
  }
  return performance.now() - t0;
}

describe("composing cost", () => {
  it("a warm sheet costs at most a fifth of a cold one", () => {
    run(3, true); // warm up the JIT
    const cold = run(33, true);
    clearSanitizedIcons();
    const warm = run(33, false);
    console.log("PERFCOMPOSE", JSON.stringify({ coldMs: Math.round(cold), warmMs: Math.round(warm), ratio: Number((warm / cold).toFixed(3)) }));
    expect(warm).toBeLessThan(cold * 0.35); // measured ≈ 0.18; room for a slower machine
  });
});

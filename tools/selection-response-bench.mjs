/* global window, document */
// Browser tools are intentionally external: SELECTION_BROWSER_TOOLS=/absolute/external/install.
// node tools/selection-response-bench.mjs http://127.0.0.1:5174 baseline.json
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
if (!process.env.SELECTION_BROWSER_TOOLS) throw new Error("Set SELECTION_BROWSER_TOOLS to the external browser-tools install directory");
const require = createRequire(resolve(process.env.SELECTION_BROWSER_TOOLS, "package.json"));
const { chromium } = require("playwright-core");
const portable = require("@sparticuz/chromium").default;
const results = [];
for (const count of [100, 1000]) for (const tab of ["batch", "selectionV2", "generateSvg", "upload"]) {
  const browser = await chromium.launch({ executablePath: await portable.executablePath(), args: [...portable.args, "--js-flags=--max-old-space-size=3072"], headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => console.error(error));
    await page.goto(`${process.argv[2]}/tools/perf/selection-response.html`);
    await page.waitForFunction(() => window.selectionBench);
    await page.evaluate(({ tab, count }) => window.selectionBench.mount(tab, count), { tab, count });
    await page.waitForFunction((n) => document.querySelectorAll('[role="listitem"]').length === n, count);
    // Let real SVG reads, image decoding, export-preview debounce and initial paints settle outside timing.
    await page.waitForTimeout(2500);
    // Bulk, then the three reported gestures. Each click changes state, so the
    // fixture records exactly one sample; the first two of each kind are warmup.
    const drive = async (selector) => {
      const length = await page.evaluate(() => window.selectionBench.samples.length);
      await page.locator(selector).evaluate((el) => el.click());
      await page.waitForFunction((length) => window.selectionBench.samples.length > length, length);
    };
    for (let cycle = 0; cycle < 8; cycle++) for (const on of [true, false]) {
      await drive(on ? "#select-all" : "#clear-all");
      const actual = await page.locator('input[type="checkbox"]:checked').count();
      if (actual !== (on ? count : 0)) throw new Error(`${tab}/${count}: wrong selection ${actual}`);
    }
    for (let cycle = 0; cycle < 8; cycle++) {
      await drive(cycle % 2 === 0 ? "#click-first" : "#click-last");
      await drive("#toggle-first");
      await drive("#arrow-down");
      await drive("#arrow-up");
    }
    const all = await page.evaluate(() => window.selectionBench.samples.slice(4));
    const median = (xs) => { const sorted = [...xs].sort((a,b) => a-b); return (sorted[Math.floor((xs.length-1)/2)] + sorted[Math.floor(xs.length/2)]) / 2; };
    const byKind = {};
    for (const kind of ["select-all", "deselect-all", "click", "toggle", "arrow"]) {
      const xs = all.filter((s) => s.kind === kind);
      if (xs.length === 0) continue;
      byKind[kind] = {
        commitMedianMs: median(xs.map((s) => s.commitMs)),
        frameMedianMs: median(xs.map((s) => s.frameMs)),
        historyBytes: xs.at(-1).historyBytes,
        n: xs.length,
      };
    }
    const samples = all;
    const result = { tab, count, samples, byKind, commitMedianMs: median(samples.map((s) => s.commitMs)), frameMedianMs: median(samples.map((s) => s.frameMs)) };
    results.push(result);
    console.log(JSON.stringify({ tab, count, byKind, samples: samples.length }));
    writeFileSync(process.argv[3], JSON.stringify({ browser: browser.version(), viewport: "1440x1000", cpuThrottle: 1, results }, null, 2));
  } finally { await browser.close(); }
}

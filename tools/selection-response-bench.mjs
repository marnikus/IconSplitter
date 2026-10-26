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
    for (let cycle = 0; cycle < 8; cycle++) for (const on of [true, false]) {
      const length = await page.evaluate(() => window.selectionBench.samples.length);
      await page.locator(on ? "#select-all" : "#clear-all").evaluate((el) => el.click());
      await page.waitForFunction((length) => window.selectionBench.samples.length > length, length);
      const actual = await page.locator('input[type="checkbox"]:checked').count();
      if (actual !== (on ? count : 0)) throw new Error(`${tab}/${count}: wrong selection ${actual}`);
    }
    const samples = await page.evaluate(() => window.selectionBench.samples.slice(2)); // identical one-cycle warmup
    const median = (xs) => { const sorted = [...xs].sort((a,b) => a-b); return (sorted[Math.floor((xs.length-1)/2)] + sorted[Math.floor(xs.length/2)]) / 2; };
    const result = { tab, count, samples, commitMedianMs: median(samples.map((s) => s.commitMs)), frameMedianMs: median(samples.map((s) => s.frameMs)) };
    results.push(result);
    console.log(JSON.stringify({ ...result, samples: samples.length }));
    writeFileSync(process.argv[3], JSON.stringify({ browser: browser.version(), viewport: "1440x1000", cpuThrottle: 1, results }, null, 2));
  } finally { await browser.close(); }
}

// Opt-in REAL Adobe draft upload acceptance. No credentials, cookie copies or mocks.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { ADOBE_ORIGIN, validateTarget, validateManifest, checkFileCarriers } from "./adobe-stock/contract.mjs";
import { verifyUpload } from "./adobe-stock/browser.mjs";
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0 || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Requires a value for ${flag}`);
  return args[i + 1];
};
const report = { runId: randomUUID(), startedAt: new Date().toISOString(), status: "blocked", evidence: "no-live-adobe-ingestion-observed", results: [] };
let browser;
let reportPath;
try {
  if (args.includes("--report")) {
    reportPath = resolve(arg("--report"));
    if (!reportPath.endsWith(".json")) { reportPath = undefined; throw new Error("Report must be a NEW JSON file"); }
  }
  const allow = args.includes("--allow-upload");
  if (!args.includes("--cdp") || !args.includes("--manifest")) throw new Error("Requires --cdp and --manifest; see docs/current/sor/upload-adobe-validation.md");
  validateTarget(arg("--cdp"), `${ADOBE_ORIGIN}/uploads`, allow);
  const manifestPath = resolve(arg("--manifest"));
  if (reportPath === manifestPath) { reportPath = undefined; throw new Error("Report cannot overwrite the input manifest"); }
  const entries = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const files = [];
  for (const entry of entries) {
    const path = resolve(dirname(manifestPath), entry.path);
    const bytes = await readFile(path);
    checkFileCarriers(path, bytes);
    files.push({ name: `iconsplitter-test-${randomUUID()}-${basename(path)}`, bytes, metadata: entry.metadata,
      mimeType: /\.eps$/i.test(path) ? "application/postscript" : "image/jpeg",
      sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  // Playwright is an optional EXTERNAL test tool, not an app dependency.
  const { chromium } = require(args.includes("--playwright") ? resolve(arg("--playwright")) : "playwright-core");
  browser = await chromium.connectOverCDP(arg("--cdp"));
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => {
    try { validateTarget(arg("--cdp"), page.url(), allow); return true; } catch { return false; }
  });
  if (pages.length !== 1) throw new Error("Open exactly ONE authenticated live Adobe uploads tab; local saved pages do not qualify");
  for (const file of files) {
    const result = await verifyUpload(pages[0], file);
    report.results.push({ file: file.name, sha256: file.sha256, ...result });
  }
  report.status = "passed";
  report.evidence = "native-upload-new-adobe-response-and-live-fields";
  console.log(`PASS: Adobe populated Title/Keywords for ${files.length} new draft uploads. Nothing submitted or deleted.`);
} catch (error) {
  report.status = report.results.length > 0 ? "failed" : "blocked-or-failed";
  // Never serialize browser errors, URLs, headers, response bodies or account state.
  const known = error instanceof Error && /^(BLOCKED:|Requires |Manifest |Adobe |File |Test file |Open exactly|Cannot uniquely|Report )/.test(error.message);
  report.reason = known ? error.message : "Live validation did not complete. Check local browser/tool setup and the live Adobe page; no acceptance pass was recorded.";
  console.error(report.reason);
  process.exitCode = 1;
} finally {
  // For a CDP connection this disconnects the client, not the user's browser.
  if (browser) await browser.close();
  if (reportPath) {
    try {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    } catch { console.error("Cannot create NEW report file. No existing file was overwritten; use a new report path."); process.exitCode = 1; }
  }
}

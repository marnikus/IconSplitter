// Interactive, local-only Getty ESP assistant. Never reads or stores credentials.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { chromium } from "playwright";
import { inspectGettyBatch, snapshotGettyBatch } from "./files.mjs";
import { createGettyBatch, getGettyBatchId, injectGettyFiles, openGettyBatchList, openGettyUploadDialog } from "./portal.mjs";

async function confirmed(terminal, message) {
  return (await terminal.question(`${message} Type YES to continue: `)).trim() === "YES";
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("This helper requires an interactive terminal.");
  const terminal = createInterface({ input: stdin, output: stdout });
  let snapshot;
  let browser;
  let phase = "initialization";
  const interrupt = () => { terminal.close(); void browser?.close(); };
  process.once("SIGINT", interrupt);
  terminal.on("SIGINT", interrupt);
  try {
    console.log("Getty ESP web helper (experimental). Use only with Getty authorization.");
    console.log("First stage the checked EPS/JPG pairs with the Getty Batch Folder option in IconSplitter.");
    const folder = (await terminal.question("Path to the staged batch folder: ")).trim().replace(/^"|"$/g, "");
    const batch = await inspectGettyBatch(folder);
    snapshot = await snapshotGettyBatch(batch);
    console.log(`\nSelected ${batch.files.length} files (${batch.totalBytes} bytes):`);
    for (const file of batch.files) console.log(`  ${file.name} (${file.size} bytes)`);
    const batchName = (await terminal.question("Getty batch name: ")).trim();
    if (!batchName || batchName.length > 120) throw new Error("Enter a batch name of 1 to 120 characters.");
    console.log("Destination: Getty ESP, new iStock creative illustration batch. CSV is not uploaded.");
    console.log("This creates a batch and may upload the listed files; it never submits for review.");
    console.log("Getty prohibits generative-AI submissions; ensure the content complies with Getty's current rules.");
    if (!await confirmed(terminal, "You have permission and want to proceed.")) return;
    phase = "browser launch";
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log("Sign in in the opened Getty browser. Complete any MFA yourself.");
    console.log("If necessary, navigate to Upload & review content / Batches. You have up to 10 minutes.");
    phase = "sign-in / batch list";
    await openGettyBatchList(page);
    phase = "batch creation";
    await createGettyBatch(page, batchName);
    const batchId = getGettyBatchId(page.url());
    if (!batchId) throw new Error("Getty did not show a verifiable new batch page.");
    console.log("Batch opened. Opening Getty upload form and selecting the confirmed files.");
    phase = "file selection";
    try {
      await openGettyUploadDialog(page, batchId);
      await injectGettyFiles(page, snapshot.files, batchId);
      console.log("Files were selected in the browser. Getty receipt has NOT been verified by this helper.");
    } catch {
      console.log("Could not safely confirm file selection. Check Getty for any in-flight upload first.");
      console.log("If no files were sent, select the EPS and JPG files manually from your staged folder.");
    }
    console.log("Wait for Getty to finish and inspect each file on the batch page; do not retry blindly.");
    await terminal.question("Press Enter only when you have finished checking Getty; this closes the browser: ");
  } catch (error) {
    if (phase === "initialization" && error instanceof Error && !/ENOENT|EACCES|EPERM/i.test(error.message)) {
      console.error(`Stopped: ${error.message}`);
    } else {
      console.error(`Stopped during ${phase}. Check the Getty page and local setup before retrying.`);
      console.error("The remote result may be unknown; check Getty for an existing batch or files before retrying.");
      if (phase === "browser launch") console.error("Install the browser once with: npx playwright install chromium");
    }
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", interrupt);
    terminal.close();
    await browser?.close();
    if (snapshot) {
      try { await snapshot.cleanup(); } catch { console.error("Could not remove temporary batch files. Check your system temp folder for iconsplitter-getty- directories."); }
    }
  }
}

await main();

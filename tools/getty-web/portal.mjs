// Only selectors evidenced by a contributor-provided ESP page are automated.
const BATCH_LIST = "https://esp.gettyimages.com/contribute/batches";

export function getGettyBatchId(address) {
  try {
    const url = new URL(address);
    if (url.origin !== "https://esp.gettyimages.com") return null;
    return /^\/contribute\/batches\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}

function assertBatchList(page) {
  const url = new URL(page.url());
  if (url.origin !== "https://esp.gettyimages.com" || url.pathname !== "/contribute/batches") {
    throw new Error("Not on the expected Getty batch list; no batch created.");
  }
}

export async function openGettyBatchList(page) {
  await page.goto(BATCH_LIST, { waitUntil: "domcontentloaded" });
  await page.locator("[data-cy=create-batch-button]").waitFor({ state: "visible", timeout: 600000 });
  assertBatchList(page);
}

export async function createGettyBatch(page, batchName) {
  assertBatchList(page);
  await page.locator("[data-cy=create-batch-button]").click();
  const dialog = page.locator("[data-cy=create-batch-dialog]");
  await dialog.waitFor({ state: "visible" });
  const type = await page.locator("[data-cy=create-batch-submission-type] input[name=submission_type]").inputValue();
  if (type !== "istock_creative_illustration") {
    throw new Error("Select iStock creative illustration in Getty, then restart; no batch was created.");
  }
  await page.locator("[data-cy=create-batch-submission-name] input").fill(batchName);
  assertBatchList(page);
  await page.locator("[data-cy=create-batch-confirm-button]").click();
  await page.waitForURL((url) => getGettyBatchId(url.href) !== null, { timeout: 30000 });
}

function assertBatchPage(page, batchId) {
  if (!batchId || getGettyBatchId(page.url()) !== batchId) {
    throw new Error("Not on the expected Getty batch page; no files selected.");
  }
}

export async function openGettyUploadDialog(page, batchId) {
  assertBatchPage(page, batchId);
  const dialog = page.locator("[data-cy=file-upload-dialog]:visible");
  const button = page.locator("[data-cy=open-upload-dialog-button]:visible");
  await dialog.or(button).first().waitFor({ state: "visible", timeout: 30000 });
  assertBatchPage(page, batchId);
  if (!await dialog.isVisible()) await button.click();
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  assertBatchPage(page, batchId);
}

export async function injectGettyFiles(page, files, batchId) {
  assertBatchPage(page, batchId);
  const dialog = page.locator("[data-cy=file-upload-dialog]:visible");
  if (!await dialog.isVisible()) throw new Error("Getty upload dialog is not open; no files selected.");
  const input = page.locator("[data-cy=file-upload-dialog]:visible input[data-cy=upload-button-file-input][type=file][multiple]");
  if (await input.count() !== 1) throw new Error("Expected one Getty device file input; select files manually.");
  const accepted = (await input.getAttribute("accept") ?? "").toLowerCase().split(",").map((value) => value.trim());
  if (!accepted.includes("image/jpeg") || !accepted.includes("application/postscript")) {
    throw new Error("Getty file input does not advertise the expected JPEG and EPS types.");
  }
  assertBatchPage(page, batchId);
  await input.setInputFiles(files);
}

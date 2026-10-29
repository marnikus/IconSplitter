// Only selectors evidenced by a contributor-provided ESP page are automated.
const BATCH_LIST = "https://esp.gettyimages.com/contribute/batches";

export function getGettyBatchId(address) {
  try {
    const url = new URL(address);
    if (url.origin !== "https://esp.gettyimages.com") return null;
    return /^\/contribute\/batches\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
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

export async function injectGettyFiles(page, files, batchId) {
  if (getGettyBatchId(page.url()) !== batchId || !batchId) throw new Error("Not on a verified Getty batch page; no files selected.");
  const input = page.locator('input[type="file"][multiple]');
  if (await input.count() !== 1) throw new Error("Expected exactly one multiple-file input; navigate to the Getty upload form and try manually.");
  const accepted = (await input.getAttribute("accept") ?? "").toLowerCase().split(",").map((value) => value.trim());
  if (!accepted.includes(".eps") || !accepted.some((value) => value === ".jpg" || value === ".jpeg" || value === "image/jpeg")) {
    throw new Error("Cannot verify the Getty file input accepts EPS and JPEG; select the files manually.");
  }
  if (getGettyBatchId(page.url()) !== batchId || !batchId) throw new Error("Not on a verified Getty batch page; no files selected.");
  await input.setInputFiles(files);
}

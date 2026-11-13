/* global document */
import { ADOBE_ORIGIN, SELECTORS, findAssets, metadataMatches } from "./contract.mjs";

/** Observe only fresh Adobe responses, never saved Redux or locally parsed values. */
export function watchAsset(page, uniqueName, expected, timeout) {
  let stop;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("Adobe did not return matching newly uploaded asset metadata before timeout")); }, timeout);
    const responseHandler = async (response) => {
      try {
        if (new URL(response.url()).origin !== ADOBE_ORIGIN || !response.ok()) return;
        if (!(response.headers()["content-type"] ?? "").includes("json")) return;
        const records = findAssets(await response.json());
        const asset = records.find((a) => a.originalName === uniqueName && a.thumbnailUrl && metadataMatches(a, expected));
        if (asset) { stop(); resolve(asset); }
      } catch { /* Non-JSON responses are not metadata evidence. Timeout remains a failure. */ }
    };
    stop = () => { clearTimeout(timer); page.off("response", responseHandler); };
    page.on("response", responseHandler);
  });
  // An upload transport error may happen before this promise is awaited.
  void ready.catch(() => {});
  return { ready, stop: () => stop() };
}

/** Select ONLY the thumbnail of the new server-confirmed asset; never an old match. */
async function selectNewAsset(page, asset, timeout) {
  await page.waitForFunction(({ tile, thumbnail }) => {
    return Array.from(document.querySelectorAll(`${tile} img`)).filter((img) => img.src === thumbnail).length === 1;
  }, { tile: SELECTORS.tile, thumbnail: asset.thumbnailUrl }, { timeout });
  const tiles = page.locator(SELECTORS.tile);
  const indices = await tiles.evaluateAll((nodes, url) => nodes.flatMap((node, i) =>
    node.querySelector("img")?.src === url ? [i] : []), asset.thumbnailUrl);
  if (indices.length !== 1) throw new Error("Cannot uniquely identify the new Adobe asset thumbnail");
  await tiles.nth(indices[0]).click();
}

/** Only native file upload + asset selection. Never set expected data in Adobe fields. */
export async function verifyUpload(page, file, timeout = 180000) {
  const watch = watchAsset(page, file.name, file.metadata, timeout);
  try {
    await page.locator(SELECTORS.file).setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.bytes });
    const asset = await watch.ready;
    await selectNewAsset(page, asset, timeout);
    await page.waitForFunction(({ selectors, expected }) => {
      const title = document.querySelector(selectors.title)?.value;
      const keywords = document.querySelector(selectors.keywords)?.value;
      if (typeof keywords !== "string") return false;
      const tags = keywords.split(/[,;\u3001]/).map((t) => t.trim()).filter(Boolean);
      return title === expected.title && JSON.stringify(tags) === JSON.stringify(expected.tags);
    }, { selectors: SELECTORS, expected: file.metadata }, { timeout });
    return { status: "passed", evidence: "new-adobe-server-response-and-selected-live-ui", titleMatches: true, keywordsMatch: true };
  } finally { watch.stop(); }
}

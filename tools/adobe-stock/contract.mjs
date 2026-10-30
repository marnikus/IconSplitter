/* global TextDecoder */
// Read-only contracts from the user's Adobe snapshot; no saved scripts/tokens run.
export const ADOBE_ORIGIN = "https://contributor.stock.adobe.com";
export const SELECTORS = Object.freeze({
  file: 'input[type="file"][name="file"]',
  title: '[data-t="asset-title-content-tagger"]',
  keywords: '[data-t="content-keywords-ui-textarea"]',
  tile: '[title="Content tile"][role="option"]',
});
export function findAssets(value) {
  const found = new Map();
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node === null || typeof node !== "object") return;
    const name = node.originalName ?? node.original_name;
    if (typeof name === "string") {
      const asset = {
        id: String(node.id ?? ""), originalName: name,
        title: typeof node.title === "string" ? node.title : "",
        keywords: Array.isArray(node.keywords) ? node.keywords.filter((v) => typeof v === "string") : [],
        thumbnailUrl: typeof node.thumbnail_url === "string" ? node.thumbnail_url : "",
      };
      found.set(`${asset.id}:${name}`, asset);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return [...found.values()];
}
export function parseSavedAssets(html) {
  const match = /window\.__react_context__\s*=\s*("(?:\\.|[^"\\])*")/.exec(html);
  if (!match) throw new Error("Not the supplied encoded Adobe page snapshot");
  const state = JSON.parse(decodeURIComponent(JSON.parse(match[1])));
  return findAssets(state.reduxState);
}
export function metadataMatches(asset, expected) {
  return asset.title === expected.title && JSON.stringify(asset.keywords) === JSON.stringify(expected.tags);
}
export function validateTarget(cdp, page, allowUpload) {
  if (!allowUpload) throw new Error("BLOCKED: explicit --allow-upload is required (creates draft uploads)");
  const endpoint = new URL(cdp);
  if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("BLOCKED: CDP must be a local HTTP endpoint without credentials");
  const target = new URL(page);
  if (target.origin !== ADOBE_ORIGIN || !/^\/uploads(?:\/|$)/.test(target.pathname)) throw new Error("BLOCKED: not a LIVE Adobe uploads tab; saved HTML is not ingestion");
}
export function validateManifest(manifest) {
  if (!Array.isArray(manifest?.files) || manifest.files.length === 0) throw new Error("Manifest requires files");
  for (const entry of manifest.files) {
    const m = entry?.metadata;
    if (typeof entry?.path !== "string" || !/\.(jpe?g|eps)$/i.test(entry.path)) throw new Error("Manifest requires JPEG/EPS paths");
    if (typeof m?.title !== "string" || !m.title.trim() || m.title.length > 200) throw new Error("Adobe title must contain 1–200 characters");
    if (!Array.isArray(m.tags) || m.tags.length < 5 || m.tags.length > 49 || m.tags.some((t) => typeof t !== "string" || !t.trim())) throw new Error("Adobe requires 5–49 nonempty keywords");
  }
  return manifest.files;
}
/** Necessary preflight only, NOT field verification or Adobe acceptance. */
export function checkFileCarriers(name, bytes) {
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Test file exceeds 50 MB");
  const text = new TextDecoder("latin1").decode(bytes);
  const jpeg = /\.jpe?g$/i.test(name);
  if (jpeg ? bytes[0] !== 255 || bytes[1] !== 216 : !text.startsWith("%!PS-Adobe")) throw new Error("File signature does not match JPEG/EPS");
  if (!text.includes("<?xpacket begin=") || !text.includes(jpeg ? "Photoshop 3.0\0" : "%%BeginPhotoshop:")) throw new Error("File lacks required embedded metadata carriers; re-export accepted fields first");
}

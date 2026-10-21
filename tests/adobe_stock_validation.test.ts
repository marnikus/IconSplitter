// These are saved-page/tool contract tests, NOT an Adobe importer acceptance pass.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSavedAssets, findAssets, metadataMatches, validateTarget, validateManifest, checkFileCarriers, SELECTORS } from "../tools/adobe-stock/contract.mjs";
const root = resolve("tests/assets/SVG to JPEG or EPS export tests");
const saved = readFileSync(`${root}/Contributors Uploaded Files.html`, "utf8");
const expected = { title: "Temporary metadata test", tags: ["one", "two", "three", "four", "five"] };

describe("supplied Adobe page contract — not live upload acceptance", () => {
  it("uses the real upload/title/keywords selectors and preserves the captured empty markup", () => {
    // Keep only form controls: never load captured scripts, images, CSS or iframes.
    const controls = (saved.match(/<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi) ?? []).join("\n");
    const doc = new DOMParser().parseFromString(controls, "text/html");
    expect(doc.querySelector(SELECTORS.file)?.getAttribute("accept")).toContain("application/postscript");
    expect(doc.querySelector(SELECTORS.title)?.textContent).toBe("");
    expect(doc.querySelector(SELECTORS.keywords)?.textContent).toBe("");
    const assets = parseSavedAssets(saved);
    expect(assets.map((a) => a.originalName).sort()).toEqual(["icon-handshake-heart_7_01_v2.eps", "icon-handshake-heart_7_03_v2.eps"]);
    // The serialized textareas do NOT represent the values in saved server state.
    expect(assets.every((a) => a.title.length > 0 && a.keywords.length >= 5)).toBe(true);
    expect(JSON.stringify(assets)).not.toMatch(/csrf|email|cookie|campaignTracking/i);
  });
  it("records Adobe's server upload boundary, not an invented in-browser metadata reader", () => {
    const bundle = readFileSync(`${root}/Contributors Uploaded Files_files/main.3ef058752f801bb751b3.js.download`, "utf8");
    expect(bundle).toContain('/uploads/presign');
    expect(bundle).toContain('i.append("file",n)');
    expect(saved).toContain('data-t="asset-title-content-tagger"');
    expect(() => parseSavedAssets("not a saved Adobe page")).toThrow();
  });
  it("distinguishes the supplied original EPS with NO metadata from newly embedded exports", () => {
    const bytes = new Uint8Array(readFileSync(`${root}/icon-handshake-heart_7_01_v2.eps`));
    expect(() => checkFileCarriers("original.eps", bytes)).toThrow(/metadata/);
  });
});

describe("live acceptance safety and matching", () => {
  it("accepts only new matching assets, exact title and ordered keywords", () => {
    const [asset] = findAssets({ result: [{ id: 42, originalName: "unique.eps", title: expected.title, keywords: expected.tags, csrfToken: "not-returned" }] });
    expect(metadataMatches(asset, expected)).toBe(true);
    expect(metadataMatches({ ...asset, title: "" }, expected)).toBe(false);
    expect(metadataMatches({ ...asset, keywords: expected.tags.slice(1) }, expected)).toBe(false);
    expect(metadataMatches({ ...asset, keywords: [...expected.tags].reverse() }, expected)).toBe(false);
    expect(findAssets({ irrelevant: true })).toEqual([]);
  });
  it("requires a live Adobe uploads page, local CDP and explicit upload authorization", () => {
    expect(() => validateTarget("http://127.0.0.1:9222", "https://contributor.stock.adobe.com/uploads", true)).not.toThrow();
    for (const [cdp, page, permission] of [
      ["https://remote.example", "https://contributor.stock.adobe.com/uploads", true],
      ["http://127.0.0.1:9222", "http://127.0.0.1:4173/Contributors Uploaded Files.html", true],
      ["http://127.0.0.1:9222", "https://contributor.stock.adobe.com/uploads", false],
    ] as const) expect(() => validateTarget(cdp, page, permission)).toThrow();
  });
  it("rejects absent fields, Adobe UI limit violations and invalid manifest files instead of a green skip", () => {
    expect(validateManifest({ files: [{ path: "image.jpg", metadata: expected }] })).toHaveLength(1);
    for (const manifest of [{ files: [] }, { files: [{ path: "source.svg", metadata: expected }] }, { files: [{ path: "file.eps", metadata: { title: "", tags: [] } }] }, { files: [{ path: "file.eps", metadata: { ...expected, title: "x".repeat(201) } }] }]) {
      expect(() => validateManifest(manifest)).toThrow();
    }
  });
  it("the live runner never fills metadata or patches asset metadata as a substitute for ingestion", () => {
    const source = readFileSync("tools/adobe-stock/browser.mjs", "utf8");
    expect(source).not.toMatch(/\.fill\(|\.type\(|\.value\s*=|request\.post|request\.patch|route\.fulfill/);
    expect(source).toContain("setInputFiles");
    expect(source).toContain("response.json()");
    expect(source).toContain("metadataMatches");
  });
});

import { EventEmitter } from "node:events";
import { watchAsset } from "../tools/adobe-stock/browser.mjs";
const response = (name: string, title = expected.title, origin = "https://contributor.stock.adobe.com") => ({
  url: () => `${origin}/uploads/assets`, ok: () => true, headers: () => ({ "content-type": "application/json" }),
  json: async () => ({ assets: [{ id: "new-asset", originalName: name, title, keywords: expected.tags, thumbnail_url: "https://example.test/new-thumbnail.jpg" }] }),
});
it("only a fresh trusted Adobe response for the unique uploaded name can satisfy the server check", async () => {
  const page = new EventEmitter();
  const watch = watchAsset(page, "unique.eps", expected, 1000);
  let matched = false; void watch.ready.then(() => { matched = true; });
  page.emit("response", response("old.eps"));
  page.emit("response", response("unique.eps", expected.title, "http://localhost"));
  page.emit("response", response("unique.eps", ""));
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(matched).toBe(false);
  page.emit("response", response("unique.eps"));
  expect((await watch.ready).originalName).toBe("unique.eps");
  expect(page.listenerCount("response")).toBe(0);
});
it("missing Adobe metadata times out as a failure, never a green skipped validation", async () => {
  const page = new EventEmitter();
  const watch = watchAsset(page, "unique.eps", expected, 20);
  page.emit("response", response("unique.eps", ""));
  await expect(watch.ready).rejects.toThrow(/Adobe did not return/);
  expect(page.listenerCount("response")).toBe(0);
});

import { spawnSync } from "node:child_process";
it("the real command fails closed without upload authorization, rather than treating offline tests as acceptance", () => {
  const result = spawnSync(process.execPath, ["tools/adobe-stock-acceptance.mjs", "--cdp", "http://127.0.0.1:9222", "--manifest", "not-opened.json"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("explicit --allow-upload");
  expect(result.stdout).not.toContain("PASS");
});

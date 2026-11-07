// icon_index.test.ts — the icon vector index's pure rules: the per-icon index
// file (`<svg>.index.json`, next to the approved SVG), freshness, the text the
// text vector is made from, and the balanced 50 % image + 50 % text similarity.
import { describe, expect, it } from "vitest";
import {
  IMAGE_MODEL, TEXT_MODEL, iconText, indexPathOf, indexStateOf, needsImageVector, parseIndexRecord,
  serializeIndexRecord, textFingerprintOf, type IconIndexRecord,
} from "../src/lib/iconIndex/record";
import { centroid, referenceOf, similarityOf } from "../src/lib/iconIndex/similarity";

const unit = (...xs: number[]) => { const v = Float32Array.from(xs); const n = Math.hypot(...xs); return v.map((x) => x / n); };
const asset = { id: "a", svgPath: "food/apple_AI.svg", fingerprint: "10:1", version: 1, title: "Red apple", description: "A fresh fruit", keywords: ["apple", "fruit"] };

function record(over: Partial<IconIndexRecord> = {}): IconIndexRecord {
  return { v: 1, id: "a", svgPath: asset.svgPath, svgFingerprint: "10:1", version: 1,
    textFingerprint: textFingerprintOf(iconText(asset)), models: { image: IMAGE_MODEL, text: TEXT_MODEL },
    render: { size: 224, background: "#FFFFFF" }, vectors: { image: unit(1, 0, 0), text: unit(0, 1) }, createdAt: "2026-11-08T00:00:00Z", ...over };
}

describe("index record", () => {
  it("lives next to the approved SVG and never looks like a pair, image or sidecar file", () => {
    const path = indexPathOf("food/apple_AI_v2.svg");
    expect(path).toBe("food/apple_AI_v2.svg.index.json");
    expect(path.endsWith(".svg")).toBe(false);
    expect(path.endsWith(".svg.json")).toBe(false);
    expect(/\.(png|jpe?g|webp)$/i.test(path)).toBe(false);
  });

  it("round-trips vectors exactly and refuses corrupt payloads", () => {
    const back = parseIndexRecord(JSON.parse(serializeIndexRecord(record())))!;
    expect(Array.from(back.vectors.image)).toEqual(Array.from(record().vectors.image));
    expect(Array.from(back.vectors.text!)).toEqual(Array.from(record().vectors.text!));
    expect(parseIndexRecord({ v: 2 })).toBeNull();
    expect(parseIndexRecord({ ...JSON.parse(serializeIndexRecord(record())), image: "%%%" })).toBeNull();
    expect(parseIndexRecord(null)).toBeNull();
  });

  it("text = title. description. tags — empty without metadata", () => {
    expect(iconText(asset)).toBe("Red apple. A fresh fruit. apple, fruit");
    expect(iconText({ id: "x" })).toBe("");
    expect(textFingerprintOf("")).toBeNull();
  });

  it("is ok, stale or missing", () => {
    expect(indexStateOf(asset, undefined)).toBe("missing");
    expect(indexStateOf(asset, record())).toBe("ok");
    expect(indexStateOf({ ...asset, fingerprint: "11:2" }, record())).toBe("stale");
    expect(indexStateOf({ ...asset, title: "Green apple" }, record())).toBe("stale");
    expect(indexStateOf(asset, record({ models: { image: "other", text: TEXT_MODEL } }))).toBe("stale");
  });

  it("re-renders the image only when the SVG or image model changed (metadata edits reuse it)", () => {
    expect(needsImageVector(asset, undefined)).toBe(true);
    expect(needsImageVector({ ...asset, title: "Green apple" }, record())).toBe(false);
    expect(needsImageVector({ ...asset, version: 2 }, record())).toBe(true);
  });
});

describe("balanced similarity", () => {
  it("centroid is the normalised mean", () => {
    const c = centroid([unit(1, 0), unit(0, 1)])!;
    expect(c[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(centroid([])).toBeNull();
  });

  it("score = 50 % image match + 50 % text match, 0–1", () => {
    const index = new Map([["r", record({ id: "r", vectors: { image: unit(1, 0, 0), text: unit(1, 0) } })]]);
    const ref = referenceOf(["r"], index);
    expect(similarityOf(ref, { image: unit(1, 0, 0), text: unit(1, 0) })).toBeCloseTo(1, 5);
    expect(similarityOf(ref, { image: unit(1, 0, 0), text: unit(0, 1) })).toBeCloseTo(0.5, 5);
    expect(similarityOf(ref, { image: unit(-1, 0, 0), text: unit(-1, 0) })).toBe(0); // negatives clamp to 0
  });

  it("falls back to the image match when either side has no text vector", () => {
    const index = new Map([["r", record({ id: "r", vectors: { image: unit(1, 0, 0), text: null } })]]);
    expect(similarityOf(referenceOf(["r"], index), { image: unit(1, 1, 0), text: unit(1, 0) })).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("has no score without an indexed reference or vectors", () => {
    expect(similarityOf(referenceOf(["missing"], new Map()), { image: unit(1, 0), text: null })).toBeNull();
    expect(similarityOf(referenceOf(["r"], new Map([["r", record({ id: "r" })]])), undefined)).toBeNull();
  });
});

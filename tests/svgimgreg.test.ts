// svgimgreg.test.ts — AI source image regeneration (user request 2026-10-16,
// archive/2026-10-16-image-regen): the version folder, the version history in
// the pair file (I-54 additive fields), the version-number rule, the Images API
// response parse, and the main-version resolution the AI thumb loads.
import { describe, expect, it } from "vitest";
import {
  IMAGE_REGEN_DIR, IMAGE_WAIT_FLOOR_MS, b64ToBlob, imageRegenDir, imageRegenFileName, imageWaitMs,
  lastImageFailure, mainImageOf, nextImageVersion, parseImageResponse, parseImageVersions,
  preferredImagePath, readImageUsage, regenOutcome, withImagesOf,
} from "../src/lib/svgimgreg";
import { PAIR_META_VERSION, newPairMeta, parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";

describe("the Images API usage block (2026-10-19: the log shows tokens + cost)", () => {
  it("reads input/output/total tokens and a router-reported cost", () => {
    const u = readImageUsage({ data: [], usage: { input_tokens: 1200, output_tokens: 4160, total_tokens: 5360, cost: 0.1734 } });
    expect(u).toEqual({ input: 1200, output: 4160, total: 5360, cost: 0.1734, currency: "USD" });
  });

  it("accepts the chat-style names too", () => {
    expect(readImageUsage({ usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })).toMatchObject({ input: 3, output: 4, total: 7, cost: null });
  });

  it("never invents a number: no usage block -> every field null", () => {
    expect(readImageUsage({ data: [{ b64_json: "x" }] })).toEqual({ input: null, output: null, total: null, cost: null, currency: "USD" });
    expect(readImageUsage({ usage: { total_tokens: "lots" } }).total).toBeNull();
  });
});

const done = (version: number, file: string) => ({ version, file, status: "done" as const, prompt: "p", model: "openai/gpt-image-2.5-sunburst", requestId: null, error: null, updatedAt: "2026-10-16T10:00:00.000Z" });
const DIR = "icons/AI source regeneration versions";

describe("the version folder and file names", () => {
  it("regenerated images live in the dedicated subfolder beside the pair", () => {
    expect(IMAGE_REGEN_DIR).toBe("AI source regeneration versions");
    expect(imageRegenDir("icons")).toBe("icons/AI source regeneration versions");
    expect(imageRegenDir("")).toBe("AI source regeneration versions");
  });

  it("version files carry the stem and an explicit version", () => {
    expect(imageRegenFileName("fog_041_AI", 1)).toBe("fog_041_AI_v1.png");
    expect(imageRegenFileName("fog_041_AI", 12)).toBe("fog_041_AI_v12.png");
  });
});

describe("the version history — RULE 13 repair, I-54 discipline", () => {
  it("parses a stored list and drops junk entries", () => {
    const list = parseImageVersions([done(1, "a_v1.png"), { junk: true }, done(2, "a_v2.png"), null]);
    expect(list.map((v) => v.version)).toEqual([1, 2]);
  });

  it("junk of every shape becomes an empty history — never a throw", () => {
    for (const junk of [null, 42, "x", {}, { version: "one" }]) {
      expect(parseImageVersions(junk)).toEqual([]);
    }
  });

  it("a failed version keeps its honest error text", () => {
    const list = parseImageVersions([{ ...done(3, "a_v3.png"), status: "failed", error: "429" }]);
    expect(list[0].status).toBe("failed");
    expect(list[0].error).toBe("429");
  });
});

describe("the version-number rule — never overwrite (disk + history)", () => {
  it("one past the highest of history and existing files", () => {
    expect(nextImageVersion("a_AI", [done(2, "a_AI_v2.png")], ["a_AI_v1.png", "a_AI_v5.png"])).toBe(6);
    expect(nextImageVersion("a_AI", [], ["a_AI_v1.png"])).toBe(2);
    expect(nextImageVersion("a_AI", [], [])).toBe(1);
  });

  it("ignores other stems' files", () => {
    expect(nextImageVersion("a_AI", [], ["b_AI_v9.png"])).toBe(1);
  });
});

describe("the Images API response", () => {
  it("accepts the documented shape and picks the first image", () => {
    expect(parseImageResponse({ created: 1, data: [{ b64_json: "AAAA" }] })).toEqual({ b64: "AAAA" });
    expect(parseImageResponse({ created: 1, data: [{ url: "https://x/y.png" }] })).toEqual({ url: "https://x/y.png" });
  });

  it("junk is null — the caller reports an honest failure", () => {
    for (const junk of [null, 7, {}, { data: [] }, { data: [{}] }, { data: "nope" }]) {
      expect(parseImageResponse(junk)).toBeNull();
    }
  });

  it("b64ToBlob decodes to the exact bytes", async () => {
    // "PNG" in base64
    const blob = b64ToBlob("UE5H", "image/png");
    expect(blob.type).toBe("image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes]).toEqual([0x50, 0x4e, 0x47]);
  });
});

describe("the main version — what the AI thumb loads", () => {
  it("the chosen version's file wins", () => {
    const versions = [done(1, `${DIR}/a_v1.png`), done(2, `${DIR}/a_v2.png`)];
    expect(preferredImagePath(versions, 2, "orig.png")).toBe(`${DIR}/a_v2.png`);
  });

  it("an invalid or absent choice falls back to the original AI file", () => {
    const versions = [done(1, `${DIR}/a_v1.png`)];
    expect(preferredImagePath(versions, 99, "orig.png")).toBe("orig.png");
    expect(preferredImagePath(versions, null, "orig.png")).toBe("orig.png");
    expect(preferredImagePath([], 1, "orig.png")).toBe("orig.png");
  });

  it("a failed version is never chosen as main", () => {
    const versions = [{ ...done(1, `${DIR}/a_v1.png`), status: "failed" as const }];
    expect(preferredImagePath(versions, 1, "orig.png")).toBe("orig.png");
  });
});

describe("the pair file carries the image history (additive, I-54)", () => {
  const base = () => newPairMeta({ id: "icons__x__y", base: "x", suffix: "y", dirPath: "icons", ai: { relPath: "icons/x_y_AI.png", name: "x_y_AI.png", fingerprint: "a:b" }, source: null });

  it("a fresh pair has no image history and no choice", () => {
    const meta = base();
    expect(meta.imageVersions).toEqual([]);
    expect(meta.imagePreferred).toBeNull();
  });

  it("the image history round-trips through the pair file", () => {
    const meta = { ...base(), imageVersions: [done(1, `${DIR}/a_v1.png`)], imagePreferred: 1 };
    const back = parsePairMeta(serializePairMeta(meta));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.meta.imageVersions.map((v) => v.version)).toEqual([1]);
      expect(back.meta.imagePreferred).toBe(1);
    }
  });

  it("a legacy file without the fields parses and defaults cleanly", () => {
    const legacy = JSON.parse(serializePairMeta(base()));
    delete legacy.imageVersions;
    delete legacy.imagePreferred;
    const back = parsePairMeta(JSON.stringify(legacy));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.meta.imageVersions).toEqual([]);
      expect(back.meta.imagePreferred).toBeNull();
    }
  });

  it("the pair file version stays 2 — the fields are additive", () => {
    expect(PAIR_META_VERSION).toBe(2);
    const back = parsePairMeta(serializePairMeta({ ...base(), imagePreferred: 1 }));
    expect(back.ok && back.meta.v === 2).toBe(true);
  });
});

// 2026-10-19 fix (archive/2026-10-19-image-regen-fix): the run is visible and
// honest, and the main image is what the SVG generation reads.
const failed = (version: number, error: string) => ({ ...done(version, `a_v${version}.png`), status: "failed" as const, error });

describe("the image wait — RC7: an image arrives in one piece", () => {
  it("never waits less than the image floor, and keeps a longer stall window", () => {
    expect(IMAGE_WAIT_FLOOR_MS).toBe(300_000);
    expect(imageWaitMs(120_000)).toBe(300_000);
    expect(imageWaitMs(600_000)).toBe(600_000);
  });
});

describe("the last attempt's failure — the row strip line (RC4)", () => {
  it("names the error only while the LAST attempt failed", () => {
    expect(lastImageFailure([])).toBeNull();
    expect(lastImageFailure([done(1, "a_v1.png")])).toBeNull();
    expect(lastImageFailure([done(1, "a_v1.png"), failed(2, "HTTP 400 bad size")])).toBe("HTTP 400 bad size");
    expect(lastImageFailure([failed(1, "boom"), done(2, "a_v2.png")])).toBeNull();
  });

  it("a failed entry without a recorded reason still says it failed", () => {
    expect(lastImageFailure([{ ...failed(1, ""), error: null }])).toBe("unknown error");
  });
});

describe("the main image — RC8: the one file the SVG generation reads", () => {
  it("is the chosen done version, else the original", () => {
    const meta = { imageVersions: [done(1, `${DIR}/fog_AI_v1.png`), failed(2, "x")], imagePreferred: 1 };
    expect(mainImageOf(meta, "icons/fog_AI.png")).toBe(`${DIR}/fog_AI_v1.png`);
    expect(mainImageOf({ ...meta, imagePreferred: 2 }, "icons/fog_AI.png")).toBe("icons/fog_AI.png");
    expect(mainImageOf({ ...meta, imagePreferred: null }, "icons/fog_AI.png")).toBe("icons/fog_AI.png");
    expect(mainImageOf(null, "icons/fog_AI.png")).toBe("icons/fog_AI.png");
  });
});

describe("the outcome toast — RULE 4: never a success-looking no-op", () => {
  it("all regenerated", () => {
    expect(regenOutcome({ total: 2, done: 2, failed: 0, reason: null })).toEqual({
      msg: "Regenerated 2 AI sources — each is now the main image", err: false,
    });
    expect(regenOutcome({ total: 1, done: 1, failed: 0, reason: null }).msg).toBe("Regenerated 1 AI source — it is now the main image");
  });

  it("some failed: the count AND the first reason", () => {
    expect(regenOutcome({ total: 3, done: 2, failed: 1, reason: "HTTP 429 rate limited" })).toEqual({
      msg: "Regenerated 2 of 3 AI sources — 1 failed: HTTP 429 rate limited", err: true,
    });
  });

  it("nothing regenerated: the reason, as an error", () => {
    expect(regenOutcome({ total: 1, done: 0, failed: 1, reason: "HTTP 400 Unknown parameter" })).toEqual({
      msg: "No AI source was regenerated — HTTP 400 Unknown parameter", err: true,
    });
  });

  it("stopped: what landed, what failed, what was never sent", () => {
    expect(regenOutcome({ total: 5, done: 1, failed: 0, reason: null })).toEqual({
      msg: "Stopped — 1 regenerated, 0 failed, 4 not sent", err: false,
    });
    expect(regenOutcome({ total: 4, done: 0, failed: 1, reason: "boom" })).toEqual({
      msg: "Stopped — 0 regenerated, 1 failed, 3 not sent: boom", err: true,
    });
  });
});

describe("field ownership — RC6: an SVG save never drops the image history", () => {
  it("takes the image fields from the latest in-memory copy, everything else from the SVG save", () => {
    const svgSide = { id: "x", versions: [1, 2], imageVersions: [], imagePreferred: null };
    const latest = { imageVersions: [done(1, `${DIR}/fog_AI_v1.png`)], imagePreferred: 1 };
    expect(withImagesOf(svgSide, latest)).toEqual({ id: "x", versions: [1, 2], imageVersions: latest.imageVersions, imagePreferred: 1 });
    expect(withImagesOf(svgSide, null)).toBe(svgSide);
  });
});

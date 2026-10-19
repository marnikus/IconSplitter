// imgmodel.test.ts — AiVersion parser tolerates junk (RULE 13).
import { describe, expect, it } from "vitest";
import { NO_COST, parseAiVersion } from "../src/lib/imgmodel";

const good = {
  version: 2, imagePath: "AI source regeneration versions/icon_AI_v2.png",
  status: "generated", review: "pending", prompt: "p", provider: "openai",
  model: "openai/gpt-image-2.5-sunburst", requestedAt: "t", completedAt: "t",
  usage: { input: null, output: null, total: null },
  cost: { ...NO_COST },
  validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 100 },
  batch: null, error: null, requestId: null, fromVersion: 1,
};

describe("parseAiVersion — tolerant read (RULE 13)", () => {
  it("refuses null / non-object / wrong status / wrong review / bad version", () => {
    expect(parseAiVersion(null)).toBeNull();
    expect(parseAiVersion("x")).toBeNull();
    expect(parseAiVersion({ ...good, status: "bogus" })).toBeNull();
    expect(parseAiVersion({ ...good, review: "bogus" })).toBeNull();
    expect(parseAiVersion({ ...good, version: 0 })).toBeNull();
    expect(parseAiVersion({ ...good, version: "2" })).toBeNull();
    expect(parseAiVersion({ ...good, imagePath: null })).toBeNull();
  });

  it("reads a valid record and fills in defaults for missing fields", () => {
    const out = parseAiVersion(good);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(2);
    expect(out!.status).toBe("generated");
    expect(out!.review).toBe("pending");
    expect(out!.validation.width).toBe(1024);
    expect(out!.cost.currency).toBe("USD");
    expect(out!.fromVersion).toBe(1);
  });

  it("defaults unknown optional fields gracefully", () => {
    const out = parseAiVersion({ version: 2, imagePath: "x", status: "failed", review: "pending" });
    expect(out).not.toBeNull();
    expect(out!.validation.ok).toBe(false);
    expect(out!.validation.width).toBe(0);
    expect(out!.fromVersion).toBe(0);
    expect(out!.error).toBeNull();
  });
});

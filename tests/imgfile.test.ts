// imgfile.test.ts — AI source version naming & lookup (2026-10-16).
// Tests would fail if any naming/version rule is relaxed: subfolder name,
// vN pattern, nextVersion never overwrites, newest/chosen lookup matches
// the SVG-equivalent behaviour (I-70/I-72/I-74).
import { describe, expect, it } from "vitest";
import {
  AI_VERSIONS_DIR, extForFormat, imgFileName, imgRelPath, isImgVersionFile,
  newestValidImg, chosenImg, nextImgVersion, preferredImg, versionOfImgFileName,
} from "../src/lib/imgfile";
import type { AiVersion } from "../src/lib/imgmodel";

const v = (n: number, opts: Partial<AiVersion> = {}): AiVersion => ({
  version: n,
  imagePath: opts.imagePath ?? `AI source regeneration versions/icon_AI_v${n}.png`,
  status: (opts.status ?? "generated") as AiVersion["status"],
  review: opts.review ?? "pending",
  prompt: opts.prompt ?? "p",
  provider: "openai",
  model: "openai/gpt-image-2.5-sunburst",
  requestedAt: "2026-10-16T00:00:00Z",
  completedAt: "2026-10-16T00:00:05Z",
  usage: { input: null, output: null, total: null },
  cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
  validation: opts.validation ?? { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1234 },
  batch: null,
  error: opts.error ?? null,
  requestId: null,
  fromVersion: opts.fromVersion ?? 0,
});

describe("AI_VERSIONS_DIR — exact required subfolder name", () => {
  it("is the literal `AI source regeneration versions`", () => {
    expect(AI_VERSIONS_DIR).toBe("AI source regeneration versions");
  });
});

describe("extForFormat — maps output_format to extension", () => {
  it("png stays png, jpeg→jpg, webp→webp", () => {
    expect(extForFormat("png")).toBe(".png");
    expect(extForFormat("jpeg")).toBe(".jpg");
    expect(extForFormat("webp")).toBe(".webp");
  });
});

describe("imgFileName — versioned file names", () => {
  it("v2+ are _vN in the subfolder naming (the file itself sits in the subfolder)", () => {
    expect(imgFileName("icon_AI", 2, ".png")).toBe("icon_AI_v2.png");
    expect(imgFileName("icon_AI", 3, ".jpg")).toBe("icon_AI_v3.jpg");
    expect(imgFileName("icon_AI", 10, ".webp")).toBe("icon_AI_v10.webp");
  });
});

describe("imgRelPath — full relative path from root", () => {
  it("v1 stays at the original dir (no subfolder)", () => {
    expect(imgRelPath("approved", "icon_AI.png", 1)).toBe("approved/icon_AI.png");
  });
  it("v2+ are inside the versions subfolder", () => {
    expect(imgRelPath("approved/sub", "icon_AI.png", 2)).toBe(
      "approved/sub/AI source regeneration versions/icon_AI_v2.png",
    );
  });
  it("root dir (empty dirPath) still works", () => {
    expect(imgRelPath("", "icon_AI.png", 2)).toBe("AI source regeneration versions/icon_AI_v2.png");
  });
});

describe("versionOfImgFileName — recognises versioned files", () => {
  it("matches the _vN pattern exactly, not substrings", () => {
    expect(versionOfImgFileName("icon_AI_v2.png", "icon_AI")).toBe(2);
    expect(versionOfImgFileName("icon_AI_v10.jpg", "icon_AI")).toBe(10);
    expect(versionOfImgFileName("icon_AI.png", "icon_AI")).toBeNull();
    expect(versionOfImgFileName("icon_AI_v2.png", "other")).toBeNull();
    expect(versionOfImgFileName("icon_AI_v2.png.extra", "icon_AI")).toBeNull();
  });
});

describe("isImgVersionFile — is this file a version of the given stem?", () => {
  it("accepts vN files in the subfolder", () => {
    expect(isImgVersionFile("AI source regeneration versions/icon_AI_v3.png", "icon_AI", ".png")).toBe(true);
    expect(isImgVersionFile("x/icon_AI.png", "icon_AI", ".png")).toBe(false);
    expect(isImgVersionFile("AI source regeneration versions/other_v3.png", "icon_AI", ".png")).toBe(false);
  });
});

describe("nextImgVersion — never overwrites (I-72/I-70)", () => {
  it("is v2 when nothing exists on disk or in history (v1 is the original)", () => {
    expect(nextImgVersion("icon_AI", [], [])).toBe(2);
  });
  it("is v2 when one v1 original is recorded", () => {
    expect(nextImgVersion("icon_AI", [], [v(1)])).toBe(2);
  });
  it("picks one past the highest number on disk OR recorded", () => {
    const files = ["AI source regeneration versions/icon_AI_v2.png"];
    expect(nextImgVersion("icon_AI", files, [v(1)])).toBe(3);
  });
  it("an orphan file on disk with no record still advances the counter", () => {
    const files = ["AI source regeneration versions/icon_AI_v5.png"];
    expect(nextImgVersion("icon_AI", files, [])).toBe(6);
  });
  it("a record with no matching file still advances the counter", () => {
    expect(nextImgVersion("icon_AI", [], [v(4)])).toBe(5);
  });
});

describe("newestValidImg — the newest generated+valid version", () => {
  it("returns null for an empty list", () => {
    expect(newestValidImg([])).toBeNull();
  });
  it("skips failed and invalid entries", () => {
    const list = [
      v(2, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } }),
      v(3, { status: "failed", error: "bad" }),
      v(4, { status: "generated", validation: { ok: false, errors: ["decode"], warnings: [], width: 0, height: 0, bytes: 0 } }),
    ];
    expect(newestValidImg(list)?.version).toBe(2);
  });
  it("picks the last valid one (order by version ascending)", () => {
    const list = [
      v(2, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } }),
      v(3, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } }),
    ];
    expect(newestValidImg(list)?.version).toBe(3);
  });
});

describe("preferredImg — the user's explicit choice", () => {
  it("is null when choice is null", () => {
    expect(preferredImg([v(2)], null)).toBeNull();
  });
  it("returns the chosen version if it is usable", () => {
    const list = [
      v(2, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } }),
      v(3, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } }),
    ];
    expect(preferredImg(list, 2)?.version).toBe(2);
  });
  it("returns null when the chosen version is failed/missing", () => {
    expect(preferredImg([v(2, { status: "failed", error: "x" })], 2)).toBeNull();
    expect(preferredImg([], 5)).toBeNull();
  });
});

describe("chosenImg — preferred when valid, else newest valid, else null", () => {
  const good = (n: number) => v(n, { status: "generated", validation: { ok: true, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1 } });
  it("follows explicit preference when usable", () => {
    expect(chosenImg([good(2), good(3)], 2)?.version).toBe(2);
  });
  it("falls back to newest valid when preference is invalid", () => {
    expect(chosenImg([good(2), v(3, { status: "failed", error: "x" })], 3)?.version).toBe(2);
  });
  it("falls back to newest valid when preference is null", () => {
    expect(chosenImg([good(2), good(3)], null)?.version).toBe(3);
  });
  it("returns null when nothing usable", () => {
    expect(chosenImg([v(2, { status: "failed", error: "x" })], null)).toBeNull();
    expect(chosenImg([], null)).toBeNull();
  });
});

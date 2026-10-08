// upload_download.test.ts — "Download all" (2026-10-08, D3/D4/D5): the PURE plan
// of which committed package file goes into the chosen folder, under which name.
// No handles and no IO here: the adapter reads and writes; these rules decide.
import { describe, expect, it } from "vitest";
import {
  downloadSummary, planDownload, type DownloadSource,
} from "../src/upload/downloadplan";
import type { OutputRecord } from "../src/lib/upload/export";

const out = (path: string): OutputRecord => ({ path, bytes: 10, hash: "h" });
const NONE = new Set<string>();

/** An icon whose committed package is svg + jpg + eps, all in its export folder. */
function full(id: string, stem: string, stale = false): DownloadSource {
  return {
    id, base: stem, stale,
    outputs: {
      svg: out(`architecture/export/${stem}.svg`),
      jpg: out(`architecture/export/${stem}.jpg`),
      eps: out(`architecture/export/${stem}.eps`),
    },
  };
}

const NO_PACKAGE: DownloadSource = {
  id: "pair_none", base: "court", stale: false, outputs: { svg: null, jpg: null, eps: null },
};

describe("planDownload — which files, under which names (D3)", () => {
  it("copies the committed svg, jpg and eps of each icon under their export names", () => {
    const plan = planDownload([full("pair_fog", "fog")], NONE);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].files).toEqual([
      { src: "architecture/export/fog.svg", name: "fog.svg" },
      { src: "architecture/export/fog.jpg", name: "fog.jpg" },
      { src: "architecture/export/fog.eps", name: "fog.eps" },
    ]);
    expect(plan.items[0].renamed).toBe(false);
    expect(plan.skipped).toEqual([]);
  });

  it("copies what was committed when the EPS stage failed (a partial package)", () => {
    const partial: DownloadSource = { ...full("pair_fog", "fog"), outputs: { ...full("x", "fog").outputs, eps: null } };
    const plan = planDownload([partial], NONE);
    expect(plan.items[0].files.map((f) => f.name)).toEqual(["fog.svg", "fog.jpg"]);
  });

  it("keeps each icon's own stem: two icons, two packages, no mixing", () => {
    const plan = planDownload([full("pair_a", "fog"), full("pair_b", "court")], NONE);
    expect(plan.items.map((i) => i.files.map((f) => f.name))).toEqual([
      ["fog.svg", "fog.jpg", "fog.eps"],
      ["court.svg", "court.jpg", "court.eps"],
    ]);
  });

  it("carries the stale flag through, so the summary can say so", () => {
    expect(planDownload([full("pair_fog", "fog", true)], NONE).items[0].stale).toBe(true);
  });
});

describe("planDownload — skipped icons are named, never exported here (D5)", () => {
  it("an icon with no committed package is skipped with its reason", () => {
    const plan = planDownload([NO_PACKAGE], NONE);
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "pair_none", base: "court", why: "no export yet" }]);
  });
});

describe("planDownload — nothing is overwritten (D4)", () => {
  it("a name the folder already holds numbers the WHOLE package, not one file", () => {
    // fog.jpg exists in the folder; fog.svg alone is free, but the package moves as one.
    const plan = planDownload([full("pair_fog", "fog")], new Set(["fog.jpg"]));
    expect(plan.items[0].files.map((f) => f.name)).toEqual(["fog_2.svg", "fog_2.jpg", "fog_2.eps"]);
    expect(plan.items[0].renamed).toBe(true);
  });

  it("numbering skips every number already taken", () => {
    const plan = planDownload([full("pair_fog", "fog")], new Set(["fog.svg", "fog_2.svg"]));
    expect(plan.items[0].files[0].name).toBe("fog_3.svg");
  });

  it("two icons with the same name in one batch: the second is numbered", () => {
    const plan = planDownload([full("pair_a", "fog"), full("pair_b", "fog")], NONE);
    expect(plan.items[0].files[0].name).toBe("fog.svg");
    expect(plan.items[1].files.map((f) => f.name)).toEqual(["fog_2.svg", "fog_2.jpg", "fog_2.eps"]);
    expect(plan.items[1].renamed).toBe(true);
  });

  it("names compare without case (Windows folders are case-insensitive)", () => {
    const plan = planDownload([full("pair_fog", "fog")], new Set(["FOG.SVG"]));
    expect(plan.items[0].files[0].name).toBe("fog_2.svg");
  });
});

describe("downloadSummary — one honest line for the toast (RULE 2/4)", () => {
  const base = { folder: "Exports", files: 6, icons: 2, renamed: 0, skipped: 0, stale: 0, missing: 0, failed: 0 };

  it("says what was written and where", () => {
    expect(downloadSummary(base)).toBe("Downloaded 6 files for 2 icons to “Exports”");
  });

  it("uses the singular for one file and one icon", () => {
    expect(downloadSummary({ ...base, files: 1, icons: 1 })).toBe("Downloaded 1 file for 1 icon to “Exports”");
  });

  it("names renamed, skipped, stale, missing and failed counts, and only the ones that happened", () => {
    const line = downloadSummary({ ...base, renamed: 1, skipped: 2, stale: 1, missing: 1, failed: 1 });
    expect(line).toContain("1 renamed (name already taken)");
    expect(line).toContain("2 without an export skipped");
    expect(line).toContain("1 stale — re-export for current files");
    expect(line).toContain("1 file missing on disk");
    expect(line).toContain("1 file could not be written");
    expect(downloadSummary(base)).not.toContain("skipped");
  });
});

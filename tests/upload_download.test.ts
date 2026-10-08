// upload_download.test.ts — "Download all" (2026-10-08): the pure planner that
// turns the selection's export records into the files one destination folder
// receives (names, collisions, what has no record), and the one honest line
// the toast and the log say about the result.
import { describe, expect, it } from "vitest";
import { downloadLine, planDownload, type DownloadSource } from "../src/lib/upload/download";
import type { ExportRecord } from "../src/lib/upload/export";

function recordWith(dir: string, stem: string, kinds: ("svg" | "jpg" | "eps")[]): ExportRecord {
  const out = (ext: string) => ({ path: `${dir}/export/${stem}.${ext}`, bytes: 10, hash: `sha256:${ext}` });
  return {
    outputs: {
      svg: kinds.includes("svg") ? out("svg") : null,
      jpg: kinds.includes("jpg") ? out("jpg") : null,
      eps: kinds.includes("eps") ? out("eps") : null,
    },
  } as unknown as ExportRecord;
}

const fog: DownloadSource = { id: "p1", base: "fog", record: recordWith("architecture", "fog", ["svg", "jpg", "eps"]) };
const arch: DownloadSource = { id: "p2", base: "arch", record: recordWith("architecture", "arch", ["svg", "jpg"]) };
const fresh: DownloadSource = { id: "p3", base: "court", record: null };
const fogTwin: DownloadSource = { id: "p4", base: "fog", record: recordWith("nature/split_02", "fog", ["svg", "jpg", "eps"]) };

describe("planDownload — the files one folder receives", () => {
  it("lists every artifact the records name, under its own name, and counts the rows with no record", () => {
    const plan = planDownload([fog, arch, fresh]);
    expect(plan.items.map((i) => [i.from, i.to])).toEqual([
      ["architecture/export/fog.svg", "fog.svg"],
      ["architecture/export/fog.jpg", "fog.jpg"],
      ["architecture/export/fog.eps", "fog.eps"],
      ["architecture/export/arch.svg", "arch.svg"],
      ["architecture/export/arch.jpg", "arch.jpg"],
    ]);
    expect(plan.items.every((i) => i.id === "p1" || i.id === "p2")).toBe(true);
    expect(plan.notExported).toBe(1);
    expect(plan.icons).toBe(2); // icons with at least one file to copy
  });

  it("keeps two icons with the same stem apart — the second package takes ' (2)' on all its files", () => {
    const plan = planDownload([fog, fogTwin]);
    expect(plan.items.filter((i) => i.id === "p4").map((i) => i.to)).toEqual(["fog (2).svg", "fog (2).jpg", "fog (2).eps"]);
    expect(plan.items.filter((i) => i.id === "p1").map((i) => i.to)).toEqual(["fog.svg", "fog.jpg", "fog.eps"]);
    const third = planDownload([fog, fogTwin, { ...fogTwin, id: "p5" }]);
    expect(third.items.filter((i) => i.id === "p5").map((i) => i.to)).toEqual(["fog (3).svg", "fog (3).jpg", "fog (3).eps"]);
  });

  it("an empty selection, or one with nothing committed, plans nothing", () => {
    expect(planDownload([])).toEqual({ items: [], notExported: 0, icons: 0 });
    expect(planDownload([fresh])).toEqual({ items: [], notExported: 1, icons: 0 });
  });
});

describe("downloadLine — the one line about the result", () => {
  it("says what was saved and where; the other parts only when they happened", () => {
    expect(downloadLine({ saved: 9, icons: 3, kept: 0, failed: 0, missing: 0, notExported: 0 }, "stock-drop"))
      .toBe("Saved 9 files (3 icons) to stock-drop");
    expect(downloadLine({ saved: 1, icons: 1, kept: 2, failed: 1, missing: 1, notExported: 1 }, "d"))
      .toBe("Saved 1 file (1 icon) to d · 2 kept (already there) · 1 missing on disk · 1 failed · 1 icon not exported yet");
    expect(downloadLine({ saved: 0, icons: 0, kept: 0, failed: 0, missing: 0, notExported: 2 }, "d"))
      .toBe("Nothing to save to d · 2 icons not exported yet");
  });
});

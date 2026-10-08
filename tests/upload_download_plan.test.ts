// upload_download_plan.test.ts — the pure rules of "Download all" (RULE 8: the
// real module, no mocks). Which selected icons have a FINISHED package and why
// the others are skipped (the words the row shows), which files belong to a
// package (its record decides, EPS only when that export had EPS on), the
// destination name of a package (one free stem for the whole trio, compared the
// way Windows and macOS compare names), the byte-level proof that a file is the
// committed one (RULE 15), and the sentence the user reads afterwards.
import { describe, expect, it } from "vitest";
import { newExportRecord, type ExportRecord, type OutputRecord } from "../src/lib/upload/export";
import { sha256HexText } from "../src/lib/upload/hash";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint } from "../src/lib/upload/settings";
import {
  allocateStem, matchesCommitted, nothingReadyPhrase, planDownload, skipPhrase, summarizeDownload,
  type DownloadRunResult, type DownloadSubject, type SkippedIcon,
} from "../src/lib/upload/download";

const DIR = "cat/split_01";

function output(name: string): OutputRecord {
  return { path: `${DIR}/export/${name}`, bytes: 10, hash: `sha256:${name}-committed` };
}

interface RecordOpts {
  status?: ExportRecord["status"];
  /** The export ran with EPS on (the record's tools.eps.enabled). */
  epsOn?: boolean;
  /** The record names an EPS file. */
  epsFile?: boolean;
  /** The record names an SVG file (false = a broken record). */
  svgFile?: boolean;
}

/** A record as the export writes it: the outputs and the EPS switch are what matter here. */
function recordOf(o: RecordOpts = {}): ExportRecord {
  const base = newExportRecord({
    pair: { id: "pair", base: "fog", suffix: "", dir: DIR },
    source: { svgPath: `${DIR}/fog_AI.svg`, version: 1, approval: "approved", fingerprint: "sha256:src" },
    settings: {
      defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS,
      fingerprint: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS),
    },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: o.epsOn ?? true,
    now: "2026-10-08T10:00:00.000Z",
  });
  return {
    ...base,
    status: o.status ?? "processed",
    outputs: {
      svg: o.svgFile === false ? null : output("fog.svg"),
      jpg: output("fog.jpg"),
      eps: o.epsFile === true ? output("fog.eps") : null,
    },
  };
}

/** A row as the plan reads it. The status follows the record, as a row does. */
function subject(id: string, record: ExportRecord | null = recordOf(), over: Partial<DownloadSubject> = {}): DownloadSubject {
  return {
    id, svgName: `${id}_AI.svg`, status: record?.status ?? "discovered",
    stale: false, running: false, record, ...over,
  };
}

function runOf(over: Partial<DownloadRunResult> = {}): DownloadRunResult {
  return { done: 0, stopped: false, saved: 0, savedIcons: 0, missing: 0, renamed: 0, failures: [], ...over };
}

describe("planDownload — which selected icons have a finished package", () => {
  it("a processed package is ready: its SVG and JPG, and its EPS when the export had EPS on", () => {
    const plan = planDownload([subject("fog", recordOf({ epsOn: true, epsFile: true }))], ["fog"]);
    expect(plan.skipped).toEqual([]);
    expect(plan.icons).toHaveLength(1);
    const icon = plan.icons[0];
    expect(icon.stem).toBe("fog");
    expect(icon.files.map((f) => f.kind)).toEqual(["svg", "jpg", "eps"]);
    expect(icon.files[0]).toEqual({ kind: "svg", path: `${DIR}/export/fog.svg`, bytes: 10, hash: "sha256:fog.svg-committed" });
    expect(icon.absent).toEqual([]);
    expect(icon.epsOff).toBe(false);
  });

  it("a package exported with EPS off delivers SVG and JPG, and says EPS is off — not missing", () => {
    const plan = planDownload([subject("fog", recordOf({ epsOn: false }))], ["fog"]);
    const icon = plan.icons[0];
    expect(icon.files.map((f) => f.kind)).toEqual(["svg", "jpg"]);
    expect(icon.absent).toEqual([]);
    expect(icon.epsOff).toBe(true);
  });

  it("an EPS left on disk by an earlier export is never delivered by a package exported without EPS", () => {
    const plan = planDownload([subject("fog", recordOf({ epsOn: false, epsFile: true }))], ["fog"]);
    expect(plan.icons[0].files.map((f) => f.kind)).toEqual(["svg", "jpg"]);
    expect(plan.icons[0].epsOff).toBe(true);
  });

  it("a partial package delivers what it has and names the EPS it lacks", () => {
    const plan = planDownload([subject("fog", recordOf({ status: "partial", epsOn: true, epsFile: false }))], ["fog"]);
    const icon = plan.icons[0];
    expect(icon.files.map((f) => f.kind)).toEqual(["svg", "jpg"]);
    expect(icon.absent).toEqual(["eps"]);
    expect(icon.epsOff).toBe(false);
  });

  it("each skipped icon names the reason the row itself shows", () => {
    const subjects = [
      subject("never", null),
      subject("stale", recordOf(), { stale: true, status: "stale" }),
      subject("failed", recordOf({ status: "failed" })),
      subject("cancelled", recordOf({ status: "cancelled" })),
      subject("interrupted", null, { status: "interrupted" }),
      subject("busy", recordOf(), { running: true }),
    ];
    const plan = planDownload(subjects, subjects.map((s) => s.id));
    expect(plan.icons).toEqual([]);
    expect(plan.skipped.map((s) => [s.id, s.reason])).toEqual([
      ["never", "not-exported"],
      ["stale", "stale"],
      ["failed", "unfinished"],
      ["cancelled", "unfinished"],
      ["interrupted", "unfinished"],
      ["busy", "running"],
    ]);
  });

  it("a ready-looking row without a record is never planned", () => {
    const plan = planDownload([subject("fog", null, { status: "processed" })], ["fog"]);
    expect(plan.icons).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "fog", name: "fog_AI.svg", reason: "unfinished" }]);
  });

  it("only the checked icons are planned, in the list's own order", () => {
    const plan = planDownload(
      [subject("b"), subject("a"), subject("c")],
      ["c", "a"],
    );
    expect(plan.icons.map((i) => i.id)).toEqual(["a", "c"]);
    expect(plan.skipped).toEqual([]);
  });

  it("a selected id that is not in the list is ignored, never invented", () => {
    expect(planDownload([subject("a")], ["zzz"])).toEqual({ icons: [], skipped: [] });
  });
});

describe("allocateStem — one free name for the whole trio", () => {
  it("keeps the stem when none of its three names is taken", () => {
    expect(allocateStem("fog", new Set())).toBe("fog");
  });

  it("moves the WHOLE trio to _v02 when any one of its names is taken", () => {
    expect(allocateStem("fog", new Set(["fog.svg"]))).toBe("fog_v02");
    expect(allocateStem("fog", new Set(["fog.jpg"]))).toBe("fog_v02");
    expect(allocateStem("fog", new Set(["fog.eps"]))).toBe("fog_v02");
  });

  it("takes the next free variation when _v02 is taken as well", () => {
    expect(allocateStem("fog", new Set(["fog.svg", "fog_v02.jpg"]))).toBe("fog_v03");
  });

  it("compares names case-insensitively, as Windows and macOS folders do", () => {
    expect(allocateStem("FOG", new Set(["fog.svg"]))).toBe("FOG_v02");
  });
});

describe("matchesCommitted — the bytes are the committed file (RULE 15)", () => {
  const body = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");

  it("is true for the same size and the same sha256", async () => {
    const hash = `sha256:${await sha256HexText("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")}`;
    expect(await matchesCommitted(body, { bytes: body.length, hash })).toBe(true);
  });

  it("is false for a changed byte of the same size", async () => {
    const hash = `sha256:${await sha256HexText("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")}`;
    const edited = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/ >");
    expect(edited.length).toBe(body.length + 1);
    expect(await matchesCommitted(edited.slice(0, body.length), { bytes: body.length, hash })).toBe(false);
  });

  it("is false for a different size, for an empty file, and for a record with no hash", async () => {
    const hash = `sha256:${await sha256HexText("<svg/>")}`;
    expect(await matchesCommitted(body, { bytes: body.length + 1, hash })).toBe(false);
    expect(await matchesCommitted(new Uint8Array(0), { bytes: 0, hash: `sha256:${await sha256HexText("")}` })).toBe(false);
    expect(await matchesCommitted(body, { bytes: body.length, hash: "" })).toBe(false);
  });
});

describe("the sentences the user reads", () => {
  const notExported: SkippedIcon = { id: "c", name: "c_AI.svg", reason: "not-exported" };
  const stale: SkippedIcon = { id: "d", name: "d_AI.svg", reason: "stale" };

  it("groups the skip reasons in a fixed order", () => {
    expect(skipPhrase([stale, notExported, { ...stale, id: "e" }])).toBe("1 not exported, 2 changed since export");
  });

  it("a full success names the files, the icons and the folder", () => {
    const plan = planDownload([subject("a"), subject("b")], ["a", "b"]);
    expect(summarizeDownload("Stock", plan, runOf({ done: 2, saved: 6, savedIcons: 2 })))
      .toBe("Saved 6 files from 2 icons to “Stock”");
  });

  it("singular forms read naturally", () => {
    const plan = planDownload([subject("a", recordOf({ epsOn: false }))], ["a"]);
    expect(summarizeDownload("Stock", plan, runOf({ done: 1, saved: 1, savedIcons: 1 })))
      .toBe("Saved 1 file from 1 icon to “Stock” · 1 without EPS — EPS export is off in Export settings");
  });

  it("names every problem: skipped, no EPS, missing, renamed, failed", () => {
    const plan = planDownload([subject("a"), subject("b", recordOf({ epsOn: false })), subject("c", null)], ["a", "b", "c"]);
    const run = runOf({
      done: 2, saved: 5, savedIcons: 2, missing: 1, renamed: 1,
      failures: [{ name: "fog_v02.jpg", why: "could not be written (disk full)" }],
    });
    expect(summarizeDownload("Stock", plan, run)).toBe(
      "Saved 5 files from 2 icons to “Stock” · 1 skipped (1 not exported)"
      + " · 1 without EPS — EPS export is off in Export settings"
      + " · 1 missing, changed or not produced — export again"
      + " · 1 renamed to avoid a clash · 1 could not be written",
    );
  });

  it("a stopped run says where it stopped and keeps the saved count", () => {
    // the run, not the arithmetic, decides it stopped: a run that never listed its folder did not stop
    const plan = planDownload([subject("a"), subject("b"), subject("c")], ["a", "b", "c"]);
    expect(summarizeDownload("Stock", plan, runOf({ done: 1, stopped: true, saved: 3, savedIcons: 1 })))
      .toBe("Saved 3 files from 1 icon to “Stock” · stopped after 1 of 3");
  });

  it("a run that could not start is not called stopped", () => {
    const plan = planDownload([subject("a")], ["a"]);
    expect(summarizeDownload("Stock", plan, runOf({ failures: [{ name: "Stock", why: "the folder could not be listed" }] })))
      .toBe("Nothing was saved to “Stock” · 1 could not be written");
  });

  it("a run that saved nothing says so plainly", () => {
    const plan = planDownload([subject("a")], ["a"]);
    expect(summarizeDownload("Stock", plan, runOf({ done: 1, missing: 3 })))
      .toBe("Nothing was saved to “Stock” · 3 missing, changed or not produced — export again");
  });

  it("when nothing is ready, the answer names what to do before any dialog opens", () => {
    const plan = planDownload([subject("a", null), subject("b", recordOf(), { stale: true, status: "stale" })], ["a", "b"]);
    expect(nothingReadyPhrase(plan)).toBe(
      "None of the 2 selected icons has a finished package (1 not exported, 1 changed since export) — export them first",
    );
  });

  it("a selection that matches no row says the list has moved on", () => {
    expect(nothingReadyPhrase(planDownload([], ["ghost"]))).toBe(
      "The selected icons are no longer in the list — rescan the folder",
    );
  });
});

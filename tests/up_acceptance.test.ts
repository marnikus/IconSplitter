// up_acceptance.test.ts — the §8 acceptance rows that the unit suites do not
// already pin down, driven through the REAL job, the REAL publication protocol
// and the REAL stores over fake folders (RULE 8): the record describes the
// bytes that were committed, a write that fails at the pointer keeps the
// previous package current, a required JPEG failure publishes nothing, an
// unavailable model is refused rather than substituted, two pairs share one
// directory without sharing a manifest, an in-place edit with identical size
// and mtime is still a different icon, and select-all/deselect-all touch
// exactly the visible rows.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { DEFAULT_EXPORT_SETTINGS } from "../src/lib/upsettings";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/gemconfig";
import type { DirHandleLike } from "../src/lib/fs";
import { subtleSha256 } from "../src/lib/upraster";
import { loadMetaCache, knownMeta, rememberMeta, type MetaSubject } from "../src/upload/stores";
import { openExportDir, scanExportDir } from "../src/upload/exportio";
import { discoverUploadRows } from "../src/upload/sources";
import { runUploadJob, type JobRequest, type RunnerDeps } from "../src/upload/runner";
import { checkAllIds, type UploadCtx } from "../src/upload/uploadactions";
import { getAppState, patchUpload, resetAppStore } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { fakeJpeg } from "./helpers/fakejpeg";

const DIR = "pairs";
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M 4 20 L 12 4 L 20 20 Z" fill="none" stroke="#101010" stroke-width="2"/></svg>`;
const META: IconMetadata = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

/** A root with ONE approved pair (`bases` adds more, in the same directory). */
function root(...bases: string[]): FakeDir {
  const top = new FakeDir("split_root");
  const folder = new FakeDir(DIR);
  const records: unknown[] = [];
  for (const base of bases) {
    const id = pairId(DIR, base, "");
    folder.children.set(`${base}_AI.png`, new FakeFile(`${base}_AI.png`, 20, 3100, "ai"));
    folder.children.set(`${base}_AI_v1.svg`, new FakeFile(`${base}_AI_v1.svg`, SOURCE_SVG.length, 3300, SOURCE_SVG));
    folder.children.set(`${base}_AI.svg.json`, new FakeFile(`${base}_AI.svg.json`, 10, 3300,
      serializePairMeta(pairFile(DIR, `${base}_AI.png`, {
        id, decision: "approved", preferred: 1,
        versions: [svgVersion(`${DIR}/${base}_AI_v1.svg`, { version: 1, review: "approved" })],
      }))));
    records.push({ pair_id: id, source: null, ai_result: `${DIR}/${base}_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  }
  top.children.set(DIR, folder);
  top.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records })));
  return top;
}

function requestFor(base: string, over: Partial<JobRequest> = {}): JobRequest {
  const id = pairId(DIR, base, "");
  return {
    row: {
      id, iconBase: base, name: `${base}_AI.png`, dirPath: DIR, metaPath: `${DIR}/${base}_AI.svg.json`,
      version: 1, svgName: `${base}_AI_v1.svg`, svgRelPath: `${DIR}/${base}_AI_v1.svg`,
      svgFingerprint: `${SOURCE_SVG.length}:3300`, contentSha: "h", warnings: [],
      exportState: "discovered", record: null, recovery: null,
    },
    rootName: "split_root", settings: { ...DEFAULT_EXPORT_SETTINGS }, prompt: "Task: name the icon.",
    apiKey: "KEY", gemini: DEFAULT_GEMINI_CONFIG, metadata: META, allowAi: false, ...over,
  };
}

function deps(picked: DirHandleLike, over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    readSourceBytes: async () => new TextEncoder().encode(SOURCE_SVG),
    scanExport: (dirPath) => scanExportDir(picked, dirPath),
    openExport: (dirPath) => openExportDir(picked, dirPath),
    raster: {
      rasterize: async () => new Uint8Array(fakeJpeg(3886, 3886)),
      decode: async () => true,
      sha256: subtleSha256,
    },
    pixels: { renderPixels: async () => new Uint8Array(256 * 256 * 4).fill(120) },
    renderPreviewPng: async () => "cG5n",
    sendMetadata: async () => ({ ok: false, failure: { kind: "bad-request", message: "no request expected", retryAfterMs: null, retryable: false, status: 400, requestId: null } }),
    now: () => "2026-10-07T12:00:00.000Z",
    ...over,
  };
}

const exportDirOf = (picked: FakeDir) =>
  ((picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir | undefined);
const pointerOf = (picked: FakeDir) =>
  JSON.parse((((picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir).children.get("current.json") as FakeFile).text);

/** A root that refuses to CREATE one file name at any depth — a write fault. */
function stubborn(picked: FakeDir, blocked: string): DirHandleLike {
  const wrap = (dir: FakeDir): DirHandleLike => ({
    kind: "directory", name: dir.name,
    getDirectoryHandle: async (n, o) => wrap(await dir.getDirectoryHandle(n, o)),
    getFileHandle: async (n, o) => {
      if (n === blocked) throw new DOMException("quota", "QuotaExceededError");
      return dir.getFileHandle(n, o);
    },
    entries: () => dir.entries(),
    removeEntry: (n, o) => dir.removeEntry(n, o),
  });
  return wrap(picked);
}

describe("the record describes the committed bytes (R08)", () => {
  it("names the exact size and SHA-256 of the file inside the generation", async () => {
    const picked = root("icon-a");
    expect((await runUploadJob(requestFor("icon-a"), deps(picked))).ok).toBe(true);
    const record = pointerOf(picked).record;
    const generation = ((picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir)
      .children.get("generations") as FakeDir;
    const dir = generation.children.get(record.generation) as FakeDir;
    const jpeg = await (dir.children.get("icon-a.jpg") as FakeFile).getFile();
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    expect(record.outputs.jpeg.bytes).toBe(bytes.length);
    expect(record.outputs.jpeg.sha256).toBe(await subtleSha256(bytes));
    const svg = (dir.children.get("icon-a.svg") as FakeFile).text;
    expect(record.outputs.svg.bytes).toBe(new TextEncoder().encode(svg).length);
    expect(record.outputs.svg.sha256).toBe(await subtleSha256(new TextEncoder().encode(svg)));
    expect(record.outputs.svg.relPath).toBe(`${DIR}/export/generations/${record.generation}/icon-a.svg`);
  });
});

describe("a write fault at the pointer (R01)", () => {
  it("keeps the previous generation current and says the package still stands", async () => {
    const picked = root("icon-a");
    expect((await runUploadJob(requestFor("icon-a"), deps(picked))).ok).toBe(true);
    const before = (((picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir).children.get("current.json") as FakeFile).text;

    // The next export cannot write the pointer — the ONE commit step.
    const out = await runUploadJob(
      requestFor("icon-a", { settings: { ...DEFAULT_EXPORT_SETTINGS, jpegQuality: 0.95 } }),
      deps(stubborn(picked, "current.json")),
    );
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain("previous package still stands");
    const after = (((picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir).children.get("current.json") as FakeFile).text;
    expect(after).toBe(before);
    // and the scan still reports the OLD, valid package
    const scan = await scanExportDir(picked, DIR);
    expect(scan.generation).toBe(JSON.parse(before).generation);
  });
});

describe("a required output that fails to build (R09/R21)", () => {
  it("publishes nothing: no pointer, no new generation, a failed row", async () => {
    const picked = root("icon-a");
    const out = await runUploadJob(requestFor("icon-a"), deps(picked, {
      raster: { rasterize: async () => null, decode: async () => true, sha256: subtleSha256 },
    }));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain("JPEG stage failed");
    expect(exportDirOf(picked)).toBeUndefined();
    expect(await scanExportDir(picked, DIR)).toMatchObject({ exportJson: null, outputs: [], generation: null });
  });
});

describe("an unavailable model is refused, never substituted", () => {
  it("surfaces the provider's reason and writes no package", async () => {
    const picked = root("icon-a");
    let sent = 0;
    const out = await runUploadJob(requestFor("icon-a", { metadata: null, allowAi: true }), deps(picked, {
      sendMetadata: async () => {
        sent += 1;
        return {
          ok: false,
          failure: {
            kind: "bad-request", message: "models/gemini-9 does not exist or is not available to this key",
            retryAfterMs: null, retryable: false, status: 404, requestId: null,
          },
        };
      },
    }));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain("does not exist or is not available");
    expect(sent).toBe(1); // one attempt: no retry, no fallback to another model
    expect(exportDirOf(picked)).toBeUndefined();
  });
});

describe("two pairs in one directory (R24)", () => {
  it("each commit is its own package, and neither touches the other", async () => {
    const picked = root("icon-a", "icon-b");
    expect((await runUploadJob(requestFor("icon-a"), deps(picked))).ok).toBe(true);
    const firstA = pointerOf(picked).generation;
    expect((await runUploadJob(requestFor("icon-b"), deps(picked))).ok).toBe(true);
    const dir = (picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir;
    const generations = (dir.children.get("generations") as FakeDir).children;
    for (const rec of [await scanExportDir(picked, DIR)]) {
      const read = JSON.parse(rec.exportJson as string) as { iconBase: string };
      expect(read.iconBase).toBe("icon-b"); // the pointer follows the LAST commit
    }
    expect(generations.size).toBe(2); // icon-b did not overwrite icon-a's generation
    expect([...generations.keys()]).toContain(firstA);
  });
});

describe("an in-place edit with identical size and mtime (R02/R03)", () => {
  it("is a different icon: new content hash, stale cache never applies", async () => {
    const picked = root("icon-a");
    const edited = SOURCE_SVG.replace("#101010", "#202020"); // same length, same bytes count
    expect(edited.length).toBe(SOURCE_SVG.length);
    const sha = async (relPath: string) =>
      await subtleSha256(new TextEncoder().encode(
        ((picked.children.get(DIR) as FakeDir).children.get(relPath.split("/").pop() as string) as FakeFile).text,
      ));
    const opts = { sourceSha: sha, now: () => "2026-10-07T12:00:00.000Z" };
    const scan1 = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), opts);
    const subject1: MetaSubject = { metadata: null, source: scan1.rows[0] };
    rememberMeta(subject1.source, META, {
      origin: "ai", prompt: "p", model: "m", endpointHost: "h", requestId: "r1",
      inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.0001, generatedAt: "2026-10-07T12:00:00.000Z", policy: "upload-meta-v2",
    });
    expect(Object.keys(loadMetaCache())).toEqual([scan1.rows[0].contentSha]);
    expect(knownMeta(subject1)).toEqual(META);

    // The edit keeps size AND mtime — only the bytes change.
    (picked.children.get(DIR) as FakeDir).children.set("icon-a_AI_v1.svg", new FakeFile("icon-a_AI_v1.svg", SOURCE_SVG.length, 3300, edited));
    const scan2 = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), opts);
    expect(scan2.rows[0].svgFingerprint).toBe(scan1.rows[0].svgFingerprint); // the stat cannot tell
    expect(scan2.rows[0].contentSha).not.toBe(scan1.rows[0].contentSha); // the content can
    expect(knownMeta({ metadata: null, source: scan2.rows[0] })).toBeNull(); // the old answer no longer applies
  });
});

describe("select all / deselect all (R19)", () => {
  it("touches exactly the ids it is given — hidden rows keep their checks", () => {
    resetAppStore();
    patchUpload({ checked: ["hidden-1", "visible-1"] });
    const ctx = { latest: { current: { app: { upload: { checked: [] } } } } } as unknown as UploadCtx;
    const checkedNow = () => getAppState().upload.checked;
    const run = (ids: string[], on: boolean) => {
      ctx.latest.current.app.upload.checked = checkedNow();
      checkAllIds(ctx, ids, on);
    };
    run(["visible-1", "visible-2"], true);
    expect([...checkedNow()].sort()).toEqual(["hidden-1", "visible-1", "visible-2"]);
    run(["visible-1", "visible-2"], false);
    expect(checkedNow()).toEqual(["hidden-1"]);
    run([], true); // an empty scope is a true no-op, never "everything"
    expect(checkedNow()).toEqual(["hidden-1"]);
  });
});

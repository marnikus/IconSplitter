// up_recovery.test.ts — the recovery slice end to end (report §5/R10): the
// REAL job, the REAL export protocol (exportio over a fake folder) and the
// REAL journal store. The rows here are the acceptance matrix's: a run that
// dies after the paid answer keeps that answer, a restart shows Interrupted
// exactly once with zero auto resends, and a re-export of the same icon never
// pays twice. Deleting the journal wiring fails every assertion below.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { DEFAULT_EXPORT_SETTINGS } from "../src/lib/upsettings";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/gemconfig";
import { buildExportRecord, serializePointer } from "../src/lib/upexport";
import { jobJournal, makeJournalStore } from "../src/upload/jobjournal";
import { discoverUploadRows } from "../src/upload/sources";
import { openExportDir, scanExportDir } from "../src/upload/exportio";
import { runUploadJob, type JobRequest, type RunnerDeps } from "../src/upload/runner";
import { serializePairMeta } from "../src/lib/pairmeta";
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
const ANSWER = JSON.stringify(META);
const SENT = "2026-10-07T12:00:00.000Z";
const AI_PROV = {
  origin: "ai" as const, prompt: "Task: name the icon.", model: DEFAULT_GEMINI_CONFIG.model,
  endpointHost: "generativelanguage.googleapis.com", requestId: "req-1",
  inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.0001, generatedAt: SENT, policy: "upload-meta-v2",
};

function root(): FakeDir {
  const root = new FakeDir("split_root");
  const folder = new FakeDir(DIR);
  folder.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 20, 3100, "ai"));
  folder.children.set("icon-a_AI_v1.svg", new FakeFile("icon-a_AI_v1.svg", SOURCE_SVG.length, 3300, SOURCE_SVG));
  folder.children.set("icon-a_AI.svg.json", new FakeFile("icon-a_AI.svg.json", 10, 3300,
    serializePairMeta(pairFile(DIR, "icon-a_AI.png", {
      id: pairId(DIR, "icon-a", ""), decision: "approved", preferred: 1,
      versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })],
    }))));
  root.children.set(DIR, folder);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{ pair_id: pairId(DIR, "icon-a", ""), source: null, ai_result: `${DIR}/icon-a_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }],
  })));
  return root;
}

const pairDir = (picked: FakeDir) => picked.children.get(DIR) as FakeDir;

function row(): JobRequest["row"] {
  return {
    id: pairId(DIR, "icon-a", ""), iconBase: "icon-a", name: "icon-a_AI.png", dirPath: DIR,
    metaPath: `${DIR}/icon-a_AI.svg.json`, version: 1, svgName: "icon-a_AI_v1.svg",
    svgRelPath: `${DIR}/icon-a_AI_v1.svg`, svgFingerprint: "6:3300", contentSha: "h6",
    warnings: [], exportState: "discovered", record: null, recovery: null,
  };
}

function request(over: Partial<JobRequest> = {}): JobRequest {
  return {
    row: row(), rootName: "split_root", settings: { ...DEFAULT_EXPORT_SETTINGS }, prompt: "Task: name the icon.",
    apiKey: "KEY", gemini: DEFAULT_GEMINI_CONFIG, metadata: null, allowAi: true, ...over,
  };
}

interface Sends {
  count: number;
}

/** The real adapters, with the canvas and the provider faked (RULE 8). */
function deps(picked: FakeDir, sends: Sends, over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    readSourceBytes: async (relPath) => {
      const file = pairDir(picked).children.get(relPath.split("/").pop() as string) as FakeFile;
      return new Uint8Array(await (await file.getFile()).arrayBuffer());
    },
    scanExport: (dirPath) => scanExportDir(picked, dirPath),
    openExport: (dirPath) => openExportDir(picked, dirPath),
    raster: {
      rasterize: async () => new Uint8Array(fakeJpeg(3886, 3886)),
      decode: async () => true,
      sha256: async (bytes) => `h${bytes.length}`,
    },
    pixels: { renderPixels: async () => new Uint8Array(256 * 256 * 4).fill(120) },
    renderPreviewPng: async () => "cG5n",
    sendMetadata: async () => {
      sends.count += 1;
      return {
        ok: true, text: ANSWER, requestId: "req-1", finishReason: "STOP",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.0001 },
      };
    },
    now: () => SENT,
    journal: makeJournalStore(picked),
    ...over,
  };
}

const journalFile = (picked: FakeDir) => (pairDir(picked).children.get("export") as FakeDir).children.get("attempts.json") as FakeFile;
const journalOf = (picked: FakeDir) => JSON.parse(journalFile(picked).text);
const recovery = (picked: FakeDir) => {
  const store = makeJournalStore(picked);
  return { read: (p: string) => store.load(p), write: (p: string, j: Parameters<typeof store.save>[1]) => store.save(p, j) };
};

describe("a run that dies after the paid answer (R10)", () => {
  it("keeps the draft, and the next run publishes WITHOUT a second request", async () => {
    const picked = root();
    const sends: Sends = { count: 0 };
    // The commit cannot open the export folder — everything before it ran.
    const first = await runUploadJob(request(), deps(picked, sends, { openExport: async () => null }));
    expect(first.ok).toBe(false);
    expect(first.ok ? "ok" : first.state).toBe("failed");
    expect(sends.count).toBe(1);
    const failed = journalOf(picked);
    expect(failed.state).toBe("failed");
    expect(failed.draft.meta).toEqual(META);
    expect(failed.draft.provenance.origin).toBe("ai");

    // Recovery with the draft in hand: the model is NOT asked again.
    const resumed = await runUploadJob(
      request({ metadata: failed.draft.meta, metadataProvenance: failed.draft.provenance }), deps(picked, sends),
    );
    expect(resumed.ok).toBe(true);
    expect(sends.count).toBe(1);
    expect(journalOf(picked).state).toBe("processed");
    // and the package the resume published is the real, committed one
    const pointer = JSON.parse(((pairDir(picked).children.get("export") as FakeDir).children.get("current.json") as FakeFile).text);
    expect(pointer.record.state).toBe("processed");
    expect(pointer.record.metadata).toEqual(META);
    expect(pointer.record.provenance.origin).toBe("ai");
  });
});

describe("a restart sees Interrupted once, and never resends (R10)", () => {
  it("reports the unfinished run, then goes quiet — with zero sends", async () => {
    const picked = root();
    const sends: Sends = { count: 0 };
    // A crash leaves a `running` journal: the trace began and never settled.
    const crash = await runUploadJob(request(), deps(picked, sends, { cancelled: () => true }));
    expect(crash.ok ? "ok" : crash.state).toBe("cancelled");
    expect(journalOf(picked).state).toBe("cancelled"); // a clean cancel IS reported

    // Now the case that matters: the tab closed mid-run, so nothing settled.
    const store = makeJournalStore(picked);
    await store.save(DIR, { ...journalOf(picked), state: "running", draft: { meta: META, provenance: AI_PROV } });
    const read = recovery(picked);
    const found = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), { recovery: read });
    expect(found.rows[0].exportState).toBe("interrupted");
    expect(found.rows[0].warnings[0]).toContain("Interrupted at");
    expect(found.rows[0].recovery?.draft).toEqual(META); // the accepted answer survived
    expect(found.rows[0].recovery?.provenance?.origin).toBe("ai"); // and stays an AI answer
    expect(journalOf(picked).state).toBe("interrupted");

    // The next scan is quiet: the interruption was already reported exactly once.
    const again = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), { recovery: read });
    expect(again.rows[0].warnings).toEqual([]);
    expect(sends.count).toBe(0); // nothing was auto-resumed, let alone re-sent
  });

  it("says 're-export to finish' when nothing was accepted yet", async () => {
    const picked = root();
    const sends: Sends = { count: 0 };
    const trace = jobJournal(makeJournalStore(picked), request(), () => SENT);
    await trace.begin();
    trace.stage("preflight");
    const found = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), { recovery: recovery(picked) });
    expect(found.rows[0].recovery?.draft).toBeNull();
    expect(found.rows[0].recovery?.reason).toContain("re-export to finish");
    expect(sends.count).toBe(0);
  });
});

describe("a crash AFTER a successful commit is not an interruption", () => {
  it("settles the journal as processed and leaves the row alone", async () => {
    const picked = root();
    const sends: Sends = { count: 0 };
    expect((await runUploadJob(request({ metadata: META }), deps(picked, sends))).ok).toBe(true);
    // The crash: the pointer published, but the tab died before the journal settled.
    await makeJournalStore(picked).save(DIR, {
      ...journalOf(picked),
      state: "running",
      updatedAt: "2026-10-07T11:59:00.000Z", // older than the commit
    });
    const found = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), { recovery: recovery(picked) });
    expect(found.rows[0].exportState).toBe("processed");
    expect(found.rows[0].warnings).toEqual([]);
    expect(journalOf(picked).state).toBe("processed");
  });
});

describe("the pointer decides what exists, the journal only what happened", () => {
  it("a half-written generation is still interrupted, never 'processed'", async () => {
    const picked = root();
    const read = recovery(picked);
    const record = buildExportRecord({
      pairId: row().id, iconBase: "icon-a", rootName: "split_root", dirPath: DIR,
      source: { relPath: row().svgRelPath, version: 1, sha256: "h6", bytes: 6 },
      settings: { ...DEFAULT_EXPORT_SETTINGS }, metadata: META,
      provenance: {
        origin: "user", prompt: "p", model: "", endpointHost: "", requestId: null,
        inputTokens: null, outputTokens: null, estimatedCostUsd: null, generatedAt: SENT, policy: "upload-meta-v2",
      },
      requested: { svg: true, jpeg: true, eps: false },
      outputs: {
        svg: { relPath: `${DIR}/export/generations/gen-1/icon-a.svg`, bytes: 1, sha256: "s", optimizer: null },
        jpeg: { relPath: `${DIR}/export/generations/gen-1/icon-a.jpg`, bytes: 1, sha256: "j", width: 3886, height: 3886, mpx: 15.1, quality: 0.92 },
        eps: null,
      },
      generation: "gen-1", state: "processed", failure: null, committedAt: SENT,
    });
    const exportDir = new FakeDir("export");
    exportDir.children.set("current.json", new FakeFile("current.json", 10, 1, serializePointer(record)));
    pairDir(picked).children.set("export", exportDir);
    const found = await discoverUploadRows(picked, (p) => scanExportDir(picked, p), { recovery: read });
    expect(found.rows[0].record?.iconBase).toBe("icon-a");
    expect(found.rows[0].exportState).toBe("processed");
  });
});

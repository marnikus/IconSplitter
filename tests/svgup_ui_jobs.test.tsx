// svgup_ui_jobs.test.tsx — the SVG-to-upload tab with the naming and export
// wiring in place (design §10/§16). The pipeline itself is proven in
// svgup_job.test.ts; what THIS file proves is the part the user touches:
//   · the metadata strip starts empty, fills from a run, and is editable;
//   · an edit that breaks the policy is saved as a draft the export refuses,
//     with the policy's own words on screen;
//   · Copy copies the three fields;
//   · Export runs through the queue and the row turns Processed only when the
//     pipeline said so;
//   · Edit settings writes ONE override for THAT icon.
// The provider and the pipeline are mocked at their module boundary, so no test
// here can spend money or touch a network.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { FLASH_LITE } from "../src/lib/svgupload/provider";
import { fortyTags } from "./helpers/svgupmeta";
import UploadPanel from "../src/svgupload/UploadPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { UPLOAD_SETTINGS_KEY } from "../src/svgupload/settingsstore";
import { UPLOAD_META_KEY, resetMetaStoreCache } from "../src/svgupload/metastore";
import { resetUploadSettingsCache } from "../src/svgupload/settingsstore";
import { parseMetaStore } from "../src/lib/svgupload/meta";
import { UPLOAD_JOBS_KEY, resetJobStoreCache } from "../src/svgupload/jobstore";
import { resetSessionRestore } from "../src/svgupload/useUploadJobs";
import { clearLog, getLogState } from "../src/log/logstore";
import { setMetaStore } from "../src/svgupload/metastore";
import { SOURCE_HASH_PREFIX, sha256Hex } from "../src/lib/svgupload/sourcehash";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- the fake provider: verified catalog, and a naming call that never leaves ---
const catalogModels = [{ id: FLASH_LITE, label: "Gemini 3.1 Flash Lite" }];
vi.mock("../src/svg/catalog", () => ({ loadCatalog: () => ({ models: catalogModels, at: 1 }) }));
vi.mock("../src/svg/keystore", () => ({ loadApiKey: async () => "test-key" }));

const calls: string[] = [];
/** The pair id the row actually has — the mock cannot import it before hoisting. */
const hoisted = vi.hoisted(() => ({ id: "", fingerprint: "", holdName: false }));

/** Waits until the run's signal aborts — what the real transport does. */
function heldUntilAborted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) { resolve(); return; }
    signal?.addEventListener("abort", () => resolve(), { once: true });
    setTimeout(resolve, 3000); // never hangs a suite if the abort never comes
  });
}
vi.mock("../src/svgupload/runupload", async () => {
  const { acceptedMeta } = await import("./helpers/svgupmeta");
  // The record carries the fingerprint the scan reports for the fixture file
  // (its content hash), so the answer counts as FRESH — the stale path is proven
  // in svgup_meta.test.ts and in the exporter's re-export matrix.
  const named = () => acceptedMeta({ pairId: hoisted.id, sourceFingerprint: hoisted.fingerprint });
  return {
    providerCard: (args: { model: string }) => ({
      choice: args.model === "" ? { ok: true, model: FLASH_LITE, source: "verified" } : { ok: true, model: args.model, source: "verified" },
      url: "https://example.test/v1/chat/completions", fallback: FLASH_LITE,
    }),
    generateMetadataFor: async (ctx: { signal?: AbortSignal }) => {
      calls.push("name");
      if (hoisted.holdName) await heldUntilAborted(ctx.signal);
      if (ctx.signal?.aborted === true) {
        // The real module's rule: an aborted request is PENDING, never accepted.
        return { record: acceptedMeta({ pairId: hoisted.id, status: "pending" }), meta: null, error: "Cancelled." };
      }
      const record = named();
      return { record, meta: { title: record.title, description: record.description, tags: record.tags }, error: null };
    },
    runExport: async () => {
      calls.push("export");
      return { status: "processed", record: null, note: "Exported and verified.", folderPath: "run/export", skipped: false, meta: named() };
    },
  };
});

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

const SVG_DOC = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
/** The content identity the scan computes for the fixture file (report R02). */
const SVG_HASH = `${SOURCE_HASH_PREFIX}${await sha256Hex(new TextEncoder().encode(SVG_DOC))}`;
const RUN_DIR = "_split_output/2026-10/2026-10-05_23-30-19";
const PIECE_DIR = `${RUN_DIR}/icon-trophy-star_AI_7/split_04`;
const AI_NAME = "icon-trophy-star_AI_7_04.png";
const STEM = "icon-trophy-star_AI_7_04";
const ID = pairId(PIECE_DIR, "icon-trophy-star", "_7_04");

/** The split_04 folder of the fixture tree, for planting a published package. */
function dirOf(): FakeDir {
  const root = (stored.get("__svg__") as { source: FakeDir }).source;
  let dir = root;
  for (const name of PIECE_DIR.split("/")) {
    const next = dir.children.get(name);
    if (!(next instanceof FakeDir)) throw new Error(`missing ${name}`);
    dir = next;
  }
  return dir;
}

/** The `export/` folder with one published JPEG in it. */
function exportDirOfWith(jpeg: FakeFile): FakeDir {
  const dir = new FakeDir("export");
  dir.children.set(jpeg.name, jpeg);
  return dir;
}

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

function makeTree(): FakeDir {
  const root = new FakeDir("test_processing_2");
  let dir = root;
  for (const name of PIECE_DIR.split("/")) {
    const next = new FakeDir(name);
    dir.children.set(name, next);
    dir = next;
  }
  dir.children.set(AI_NAME, new FakeFile(AI_NAME, 20, 2100, "png"));
  dir.children.set(`${STEM}_v2.svg`, new FakeFile(`${STEM}_v2.svg`, SVG_DOC.length, 2201, SVG_DOC));
  const versions = [svgVersion(`${PIECE_DIR}/${STEM}_v2.svg`, { version: 2, review: "approved" })];
  const meta = pairFile(PIECE_DIR, AI_NAME, { id: ID, decision: "approved", versions, preferred: 2 });
  dir.children.set(`${STEM}.svg.json`, new FakeFile(`${STEM}.svg.json`, 10, 2300, serializePairMeta(meta)));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{ pair_id: ID, source: "icon-trophy-star.png", ai_result: `${PIECE_DIR}/${AI_NAME}`, decision: "approved", reviewed_at: "2026-10-05T09:00:00.000Z" }],
  })));
  return root;
}

async function waitFor(sel: string): Promise<void> {
  const until = Date.now() + 4000;
  await act(async () => {
    while (q(sel) === null && Date.now() < until) await new Promise((r) => setTimeout(r, 2));
  });
  expect(q(sel), `${sel} never appeared`).not.toBeNull();
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>); });
  await waitFor(`[data-testid=up-row-${ID}]`);
}

async function click(sel: string): Promise<void> {
  await act(async () => { q(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

/** React's controlled inputs need the native setter path. */
async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const input = q(sel) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

let clipboard = "";
beforeEach(async () => {
  // jsdom has no object URLs; the dialog makes one per published JPEG.
  URL.createObjectURL = () => `blob:test-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => undefined;
  hoisted.id = ID;
  hoisted.holdName = false;
  hoisted.fingerprint = SVG_HASH; // the v2 file's CONTENT hash, as the scan reports it
  localStorage.clear();
  // The two module-level stores cache across tests; clear both, or one test's
  // draft would decide the next test's row state.
  setMetaStore(parseMetaStore(null));
  resetMetaStoreCache();
  resetUploadSettingsCache();
  resetJobStoreCache();
  stored.clear();
  stored.set("__svg__", { source: makeTree() });
  calls.length = 0;
  clipboard = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => { clipboard = text; } },
  });
  if (ui) await act(async () => ui.unmount());
  document.body.innerHTML = "";
});

describe("the metadata strip", () => {
  it("starts empty, states the policy, and fills after one run", async () => {
    await mount();
    expect(txt(`[data-testid=up-meta-${ID}]`)).toContain("not generated yet");
    expect(txt(`[data-testid=up-policy-${ID}]`)).toContain("40 tags required");
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-title-${ID}]`);
    expect(calls).toEqual(["name"]);
    expect((q(`[data-testid=up-title-${ID}]`) as HTMLInputElement).value).toContain("Trophy award symbol");
    expect(txt(`[data-testid=up-meta-state-${ID}]`)).toContain("metadata ok");
    expect(localStorage.getItem(UPLOAD_META_KEY)).toContain("Trophy award symbol");
  });

  it("copies title, description and tags with one button", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-copy-${ID}]`);
    await click(`[data-testid=up-copy-${ID}]`);
    const lines = clipboard.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Trophy award symbol");
    expect(lines[2].split(",")).toHaveLength(40);
  });

  it("copies ONE field from its own head, and counts the keywords", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-copy-title-${ID}]`);
    // The head states the policy the field is judged by, next to its counter.
    expect(txt(`[data-testid=up-head-title-${ID}]`)).toContain("5");
    expect(txt(`[data-testid=up-keywords-${ID}]`)).toContain("40/40 keywords");
    await click(`[data-testid=up-copy-title-${ID}]`);
    expect(clipboard).toContain("Trophy award symbol");
    expect(clipboard.split("\n")).toHaveLength(1); // one field, not the whole answer
    await click(`[data-testid=up-copy-tags-${ID}]`);
    expect(clipboard.split(",")).toHaveLength(40);
  });

  it("shows a short answer as a short count, never as a pass", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-tags-${ID}]`);
    await type(`[data-testid=up-tags-${ID}]`, fortyTags().slice(0, 39).join(", "));
    expect(txt(`[data-testid=up-keywords-${ID}]`)).toContain("39/40");
    expect(txt(`[data-testid=up-keywords-${ID}]`)).not.toContain("✓");
  });

  it("saves a 39-tag edit as a draft and refuses to export it", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-tags-${ID}]`);
    await type(`[data-testid=up-tags-${ID}]`, fortyTags().slice(0, 39).join(", "));
    await click(`[data-testid=up-save-${ID}]`);
    expect(txt(`[data-testid=up-verdict-${ID}]`)).toContain("40");
    expect(txt(`[data-testid=up-meta-state-${ID}]`)).toContain("needs review");
    const exportButton = q(`[data-testid=up-act-export-${ID}]`) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(exportButton.title).toContain("accepted");
    const storedText = localStorage.getItem(UPLOAD_META_KEY) ?? "";
    expect(storedText).toContain("\"rejected\""); // a draft, never an accepted answer
  });
});

describe("exporting from a row", () => {
  it("runs the pipeline and turns the row Processed only when it said so", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-act-export-${ID}]`);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const button = q(`[data-testid=up-act-export-${ID}]`) as HTMLButtonElement;
    expect({ disabled: button.disabled, title: button.title, meta: txt(`[data-testid=up-meta-state-${ID}]`) }).toEqual({ disabled: false, title: "Export", meta: "metadata ok" });
    await click(`[data-testid=up-act-export-${ID}]`);
    await waitFor(`[data-testid=up-state-${ID}]`);
    const until = Date.now() + 4000;
    await act(async () => {
      while (!txt(`[data-testid=up-state-${ID}]`).includes("Processed") && Date.now() < until) await new Promise((r) => setTimeout(r, 2));
    });
    expect(calls).toEqual(["name", "export"]);
    expect(txt(`[data-testid=up-state-${ID}]`)).toContain("Processed");
    expect(txt("[data-testid=up-count-processed]")).toContain("1");
  });

  it("selects the visible rows from the header checkbox (R19)", async () => {
    await mount();
    const box = () => q(`[data-testid=up-check-${ID}]`) as HTMLInputElement;
    expect(box().checked).toBe(false);
    await click("[data-testid=up-check-all]");
    expect(box().checked).toBe(true);
    expect(txt("[data-testid=up-count-icons]")).toContain("1");
    await click("[data-testid=up-check-all]");
    expect(box().checked).toBe(false);
  });

  it("cancels from the bulk bar and says the completed packages were kept", async () => {
    await mount();
    await click("[data-testid=up-cancel]"); // nothing is running: the button is disabled
    expect((q("[data-testid=up-cancel]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("cancels a metadata run that is in flight instead of letting it finish", async () => {
    hoisted.holdName = true; // the request hangs until the cancel aborts it
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await act(async () => { while (calls.length === 0) await new Promise((r) => setTimeout(r, 2)); });
    await click("[data-testid=up-cancel]");
    const until = Date.now() + 4000;
    await act(async () => {
      while (!txt(`[data-testid=up-state-${ID}]`).includes("Cancelled") && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2));
      }
    });
    expect(txt(`[data-testid=up-state-${ID}]`)).toContain("Cancelled");
    // The aborted answer is stored as pending: never an accepted metadata record.
    expect(localStorage.getItem(UPLOAD_META_KEY) ?? "").not.toContain("\"accepted\"");
  });
});

describe("a restart", () => {
  it("shows unfinished work as needs review and never re-sends it", async () => {
    // The state a closed app left behind: one icon was mid-run.
    localStorage.setItem(UPLOAD_JOBS_KEY, JSON.stringify({ states: { [ID]: "running" } }));
    resetSessionRestore(); // the module read storage once already, before this test
    await mount();
    expect(txt(`[data-testid=up-state-${ID}]`)).toContain("Interrupted");
    expect(txt(`[data-testid=up-state-${ID}]`)).toContain("needs review");
    expect(calls).toEqual([]); // nothing was sent again by itself
    const retry = q(`[data-testid=up-act-retry-${ID}]`) as HTMLButtonElement;
    expect(retry.disabled).toBe(false); // retrying stays the user's own action
    expect(txt("[data-testid=up-toast]")).toContain("interrupted");
  });
});

describe("the activity log", () => {
  it("records the naming and the export in the one global log, without the payload", async () => {
    clearLog();
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-act-export-${ID}]`);
    await click(`[data-testid=up-act-export-${ID}]`);
    const until = Date.now() + 4000;
    await act(async () => {
      while (!getLogState().entries.some((e) => e.action === "exported") && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2));
      }
    });
    const mine = getLogState().entries.filter((e) => e.feature === "upload");
    expect(mine.map((e) => e.action)).toContain("named");
    expect(mine.map((e) => e.action)).toContain("exported");
    // The icon is named; the metadata text never reaches the log.
    expect(JSON.stringify(mine)).toContain("icon-trophy-star_AI_7_04");
    expect(JSON.stringify(mine)).not.toContain("Trophy award symbol");
    expect(JSON.stringify(mine)).not.toContain("test-key");
  });
});

describe("the counts and the selection", () => {
  it("shows the seven numbers the request names, next to the phase-B ones", async () => {
    await mount();
    for (const id of ["icons", "eligible", "awaiting", "ready", "processing", "processed", "stale", "failed", "blocked", "warned"]) {
      expect(q(`[data-testid=up-count-${id}]`), `missing count ${id}`).not.toBeNull();
    }
    expect(txt("[data-testid=up-count-eligible]")).toContain("1");
    expect(txt("[data-testid=up-count-awaiting]")).toContain("1"); // no metadata yet
  });

  it("exports the SELECTION, not the whole list", async () => {
    await mount();
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-act-export-${ID}]`);
    await act(async () => { (q(`[data-testid=up-check-${ID}]`) as HTMLInputElement).click(); });
    await click("[data-testid=up-export-selected]");
    await waitFor(`[data-testid=up-state-${ID}]`);
    expect(calls.filter((c) => c === "export")).toHaveLength(1);
  });
});

describe("the row's own colours and the metadata head", () => {
  it("marks Metadata primary, Export success and Retry danger, and copies all fields", async () => {
    await mount();
    expect(q(`[data-testid=up-act-generate-${ID}]`)?.className).toContain("primary");
    expect(q(`[data-testid=up-act-export-${ID}]`)?.className).toContain("success");
    expect(q(`[data-testid=up-act-retry-${ID}]`)?.className).toContain("danger");
    await click(`[data-testid=up-generate-${ID}]`);
    await waitFor(`[data-testid=up-copy-${ID}]`);
    expect(txt(`[data-testid=up-copy-${ID}]`)).toContain("Copy all fields");
    await click(`[data-testid=up-copy-${ID}]`);
    expect(clipboard.split("\n")).toHaveLength(3);
  });
});

describe("Edit settings", () => {
  it("writes ONE field as an override for that icon only", async () => {
    await mount();
    await click(`[data-testid=up-act-settings-${ID}]`);
    await waitFor("[data-testid=up-settings-dialog]");
    await type("[data-testid=up-dialog-padding]", "18");
    expect(localStorage.getItem(UPLOAD_SETTINGS_KEY)).toContain(ID);
    expect(txt(`[data-testid=up-origin-${ID}]`)).toContain("custom settings");
    await click("[data-testid=up-dialog-reset]");
    expect(txt(`[data-testid=up-origin-${ID}]`)).toContain("inherited settings");
    await click("[data-testid=up-dialog-close]");
    expect(q("[data-testid=up-settings-dialog]")).toBeNull();
  });

  it("shows the published JPEG once a package exists, read from the folder", async () => {
    // A package exists on disk: the dialog must show THAT file, not a re-render.
    const jpeg = new FakeFile(`${STEM}.jpg`, 4, 2400);
    jpeg.data = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    dirOf().children.set("export", exportDirOfWith(jpeg));
    await mount();
    await click(`[data-testid=up-act-preview-${ID}]`);
    await waitFor("[data-testid=up-preview-dialog]");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const img = q("[data-testid=up-preview-jpeg] img") as HTMLImageElement | null;
    expect(img, "the published JPEG was not shown").not.toBeNull();
    expect(img?.src.startsWith("blob:")).toBe(true);
    expect(txt("[data-testid=up-preview-jpeg]")).not.toContain("Not exported yet");
    await click("[data-testid=up-preview-dialog-x]");
  });

  it("previews the SVG that will be written and says the JPEG is not there yet", async () => {
    await mount();
    await click(`[data-testid=up-act-preview-${ID}]`);
    await waitFor("[data-testid=up-preview-dialog]");
    expect(q("[data-testid=up-preview-svg] img")).not.toBeNull();
    expect(txt("[data-testid=up-preview-jpeg]")).toContain("Not exported yet");
    await click("[data-testid=up-preview-dialog-x]");
    expect(q("[data-testid=up-preview-dialog]")).toBeNull();
  });
});

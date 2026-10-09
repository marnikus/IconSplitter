// svg_location.test.tsx — the Generate SVG tab's "Location" action on the user's
// own tree (2026-10-06, I-56): for the file they reported — a split piece deep
// inside a run's output tree, `…\2026-10-05_18-45-20\icon-bunny-face_AI_7\split_04\icon-bunny-face_AI_7_04_v2.svg`
// — the clipboard must receive the folder the FILE lives in, never the run's
// folder and never a doubled chain. The real panel, the real scan and the real
// version rules run here, so the row's own target line and the copied folder are
// proven to be about the same file, whichever version the user chose.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// A browser with the File System Access API (the panel refuses to render
// without one): the picker itself is never used here — the handle is restored.
const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

const SVG_DOC = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

/** The root the user picked, and the full path its capture remembered (I-35). */
const ROOT = "test_processing_2";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";

/** The user's own tree: `<root>/_split_output/2026-10/<stamp>/<piece>/split_04/`. */
const RUN_DIR = "_split_output/2026-10/2026-10-05_18-45-20";
const PIECE_DIR = `${RUN_DIR}/icon-bunny-face_AI_7/split_04`;
const AI_NAME = "icon-bunny-face_AI_7_04.png";
const STEM = "icon-bunny-face_AI_7_04";
const ID = pairId(PIECE_DIR, "icon-bunny-face", "_7_04");

const PIECE_FULL = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`;
const RUN_FULL = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20`;

let host: HTMLDivElement;
let ui: Root;
/** Everything the clipboard really received, in order. */
let copied: string[];

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

/** The user's piece folder, with the pair file the generation wrote beside it. */
function makePieceTree(opts: { versions: number; preferred: number | null }): FakeDir {
  const root = new FakeDir(ROOT);
  rememberKnownRoot(root, FULL); // the full path captured at pick time (I-35)
  const pieces = PIECE_DIR.split("/");
  let dir = root;
  for (const name of pieces) {
    const next = new FakeDir(name);
    dir.children.set(name, next);
    dir = next;
  }
  dir.children.set("icon-bunny-face.png", new FakeFile("icon-bunny-face.png", 12, 2000, "ref"));
  dir.children.set(AI_NAME, new FakeFile(AI_NAME, 20, 2100, "png"));
  const versions = Array.from({ length: opts.versions }, (_, i) =>
    svgVersion(`${PIECE_DIR}/${i === 0 ? `${STEM}.svg` : `${STEM}_v${i + 1}.svg`}`, { version: i + 1 }));
  for (let v = 1; v <= opts.versions; v += 1) {
    const name = v === 1 ? `${STEM}.svg` : `${STEM}_v${v}.svg`;
    dir.children.set(name, new FakeFile(name, SVG_DOC.length, 2200 + v, SVG_DOC));
  }
  const meta = pairFile(PIECE_DIR, AI_NAME, { id: ID, decision: "approved", versions, preferred: opts.preferred });
  dir.children.set(`${STEM}.svg.json`, new FakeFile(`${STEM}.svg.json`, 10, 2300, serializePairMeta(meta)));
  // The approval the scan lists a row from: the pair's own record file (I-41) is
  // read for the versions, the decision itself comes from the legacy record set.
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{
      pair_id: ID, source: "icon-bunny-face.png", ai_result: `${PIECE_DIR}/${AI_NAME}`,
      decision: "approved", reviewed_at: "2026-10-05T09:00:00.000Z",
    }],
  })));
  return root;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Waits for the boot scan to list the pair (the walk is several turns long). */
async function waitForRow(): Promise<void> {
  const until = Date.now() + 4000;
  await act(async () => {
    while (q(`[data-testid=svg-target-${ID}]`) === null && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1));
    }
  });
  expect(q(`[data-testid=svg-target-${ID}]`), "the scanned row never appeared").not.toBeNull();
}

async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /></Host></HistoryProvider>);
  });
  await settle();
}

function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** Clicks Location and returns what the clipboard received. */
async function location(): Promise<string> {
  copied = [];
  await act(async () => { (q(`[data-testid=svg-location-${ID}]`) as HTMLButtonElement).click(); });
  await settle();
  return copied[0] ?? "";
}

beforeEach(async () => {
  await dropDb();
  window.localStorage.clear();
  stored.clear();
  clearKnownRoots();
  resetAppStore();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async (t: string) => { copied.push(t); } }, configurable: true,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
});

describe("Location — the folder of the file, not the run's folder (I-56)", () => {
  it("copies the split folder of the file the user reported", async () => {
    await mount(makePieceTree({ versions: 2, preferred: 2 }));
    await waitForRow();
    // The row names the very file the user's report names (`…_04_v2.svg`)…
    expect(txt(`[data-testid=svg-target-${ID}]`)).toBe(`${PIECE_DIR}/${STEM}_v2.svg`);
    // …and Location hands over its folder — exactly, with no doubled chain.
    expect(await location()).toBe(PIECE_FULL);
    expect(await location()).not.toBe(RUN_FULL);
    expect(txt("[data-testid=svg-toast]")).toContain(PIECE_FULL);
  });

  it("follows the chosen version to the file, never to another folder", async () => {
    // v1 chosen: a different FILE in the same folder — the copy cannot move.
    await mount(makePieceTree({ versions: 2, preferred: 1 }));
    await waitForRow();
    expect(txt(`[data-testid=svg-target-${ID}]`)).toBe(`${PIECE_DIR}/${STEM}.svg`);
    expect(await location()).toBe(PIECE_FULL);
  });

  it("names the folder even before any SVG exists (the file still is not copied)", async () => {
    await mount(makePieceTree({ versions: 0, preferred: null }));
    await waitForRow();
    expect(txt(`[data-testid=svg-target-${ID}]`)).toBe(`${PIECE_DIR}/${STEM}.svg`);
    const text = await location();
    expect(text).toBe(PIECE_FULL);
    expect(text.endsWith(".svg")).toBe(false); // a folder, never the file
  });
});

/** The prefs hook the panel expects beside it (the real one, as in the app). */

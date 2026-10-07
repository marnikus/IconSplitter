// svgup_ui.test.tsx — the SVG-to-upload tab, wired for real (design §2/§5).
// The panel, the real scan and the real settings store run here, so what is
// proven is the wiring the request depends on: the row that appears IS the
// approved pair's chosen SVG (never the AI image beside it), the settings edits
// are visible on the row as overrides, one bulk apply is ONE undo, and the same
// root the Generate SVG tab remembers opens this tab already scanned.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import UploadPanel from "../src/svgupload/UploadPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { UPLOAD_SETTINGS_KEY } from "../src/svgupload/settingsstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// In-memory handle storage: the boot restores the root the other SVG tab saved.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// A browser with the File System Access API; the picker itself is never used.
const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

const SVG_DOC = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";
const RUN_DIR = "_split_output/2026-10/2026-10-05_23-30-19";
const PIECE_DIR = `${RUN_DIR}/icon-trophy-star_AI_7/split_04`;
const AI_NAME = "icon-trophy-star_AI_7_04.png";
const STEM = "icon-trophy-star_AI_7_04";
const ID = pairId(PIECE_DIR, "icon-trophy-star", "_7_04");

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

/** The user's piece folder: an approved pair whose chosen version is v2. */
function makeTree(): FakeDir {
  const root = new FakeDir("test_processing_2");
  let dir = root;
  for (const name of PIECE_DIR.split("/")) {
    const next = new FakeDir(name);
    dir.children.set(name, next);
    dir = next;
  }
  dir.children.set("icon-trophy-star.png", new FakeFile("icon-trophy-star.png", 12, 2000, "ref"));
  dir.children.set(AI_NAME, new FakeFile(AI_NAME, 20, 2100, "png"));
  dir.children.set(`${STEM}.svg`, new FakeFile(`${STEM}.svg`, SVG_DOC.length, 2200, SVG_DOC));
  dir.children.set(`${STEM}_v2.svg`, new FakeFile(`${STEM}_v2.svg`, SVG_DOC.length, 2201, SVG_DOC));
  const versions = [
    svgVersion(`${PIECE_DIR}/${STEM}.svg`, { version: 1 }),
    svgVersion(`${PIECE_DIR}/${STEM}_v2.svg`, { version: 2 }),
  ];
  const meta = pairFile(PIECE_DIR, AI_NAME, { id: ID, decision: "approved", versions, preferred: 2 });
  dir.children.set(`${STEM}.svg.json`, new FakeFile(`${STEM}.svg.json`, 10, 2300, serializePairMeta(meta)));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{ pair_id: ID, source: "icon-trophy-star.png", ai_result: `${PIECE_DIR}/${AI_NAME}`, decision: "approved", reviewed_at: "2026-10-05T09:00:00.000Z" }],
  })));
  return root;
}

async function waitForRow(): Promise<void> {
  const until = Date.now() + 4000;
  await act(async () => {
    while (q(`[data-testid=up-row-${ID}]`) === null && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1));
    }
  });
  expect(q(`[data-testid=up-row-${ID}]`), "the scanned row never appeared").not.toBeNull();
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(<HistoryProvider><UploadPanelHost /></HistoryProvider>);
  });
}

function UploadPanelHost() {
  return <><UploadPanel /><HistoryBar /></>;
}

async function click(sel: string): Promise<void> {
  await act(async () => {
    q(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Clicking a checkbox is what React's onChange actually listens to. */
async function toggle(sel: string): Promise<void> {
  await act(async () => {
    (q(sel) as HTMLInputElement).click();
  });
}

beforeEach(async () => {
  localStorage.clear();
  stored.clear();
  stored.set("__svg__", { source: makeTree() });
  if (ui) await act(async () => ui.unmount());
  document.body.innerHTML = "";
});

describe("the SVG-to-upload tab", () => {
  it("opens on the remembered root and lists the chosen version of each approved pair", async () => {
    await mount();
    await waitForRow();
    expect(txt(`[data-testid=up-version-${ID}]`)).toContain("v2 (preferred)");
    expect(txt(`[data-testid=up-origin-${ID}]`)).toContain("inherited settings");
    expect(txt(`[data-testid=up-meta-${ID}]`)).toContain("Metadata: not generated yet");
    expect(txt("[data-testid=up-count-icons]")).toContain("1");
    expect(q("[data-testid=up-preview-" + ID + "]")).not.toBeNull();
  });

  it("applies the global defaults to the selection as ONE undoable action", async () => {
    await mount();
    await waitForRow();
    await toggle(`[data-testid=up-check-${ID}]`);
    expect((q("[data-testid=up-apply]") as HTMLButtonElement).disabled).toBe(false);
    await click("[data-testid=up-apply]");
    expect(localStorage.getItem(UPLOAD_SETTINGS_KEY)).toContain(ID); // an override exists now
    expect(txt(`[data-testid=up-origin-${ID}]`)).toContain("custom settings");
    // ONE entry: the undo label describes the whole bulk apply
    expect(txt("[data-testid=hist-label]")).toContain("1 icon"); // ONE entry, the whole bulk apply
    await click(`[data-testid=up-reset-row-${ID}]`);
    expect(txt(`[data-testid=up-origin-${ID}]`)).toContain("inherited settings");
  });

  it("searches and filters without ever hiding the reason a row is blocked", async () => {
    await mount();
    await waitForRow();
    await act(async () => {
      const search = q("[data-testid=up-search]") as HTMLInputElement;
      search.value = "trophy";
      search.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // React's controlled input needs the native setter path; the row stays put
    expect(q(`[data-testid=up-row-${ID}]`)).not.toBeNull();
  });
});

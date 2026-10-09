// upload_epsnote_ui.test.tsx — the EPS writer's automatic fix on the SVG to
// upload tab (2026-10-08): a committed package whose record says the writer
// drew a rounded <rect> as an exact outline shows an amber note on the row
// (`upload-note-{id}`), the row stays Processed, and no error is shown. A
// package without fixes shows no note. Nothing asks for confirmation.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { sha256HexText } from "../src/lib/upload/hash";
import { resetLogStore } from "../src/log/logstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { commitPackage, PACKAGE_SVG as SVG } from "./helpers/uploadpackage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

const DIR = "ui";
const FOG = pairId(`${DIR}/fog`, "fog", "");
const ARCH = pairId(`${DIR}/arch`, "arch", "");
const FIX = "1 rounded <rect> written as an exact path outline";

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";

async function waitFor(fn: () => boolean, label: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

/** fog: committed with an EPS fix on record; arch: committed, nothing fixed. */
async function makeRoot(): Promise<BinDir> {
  const fingerprint = `sha256:${await sha256HexText(SVG)}`;
  const root = new BinDir("split_root");
  const top = new BinDir(DIR);
  for (const [id, name, fixes] of [[FOG, "fog", [FIX]], [ARCH, "arch", []]] as const) {
    const dirPath = `${DIR}/${name}`;
    const dir = new BinDir(name);
    dir.children.set(`${name}_AI.png`, new BinFile(`${name}_AI.png`, "ai", 3100));
    dir.children.set(`${name}_AI.svg`, new BinFile(`${name}_AI.svg`, SVG, 3400));
    const meta = pairFile(dirPath, `${name}_AI.png`, { id, versions: [svgVersion(`${dirPath}/${name}_AI.svg`, { version: 1, review: "approved" })] });
    dir.children.set(`${name}_AI.svg.json`, new BinFile(`${name}_AI.svg.json`, serializePairMeta(meta), 3300));
    commitPackage({ dir, dirPath, name, kinds: ["svg", "jpg", "eps"], epsFixes: [...fixes], fingerprint });
    top.children.set(name, dir);
  }
  root.children.set(DIR, top);
  return root;
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  resetLogStore();
  forgetRestoreNote();
  (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(); // the panel's support check
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

describe("the EPS auto-fix note on the row", () => {
  it("shows what was fixed, keeps the row Processed, and shows nothing on a row without fixes", async () => {
    stored.set("__upload__", { source: await makeRoot() });
    await act(async () => {
      ui = createRoot(host);
      ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
    });
    await waitFor(() => q(`[data-testid=upload-note-${FOG}]`) !== null, "fog's note");
    expect(text(`[data-testid=upload-note-${FOG}]`)).toBe(`EPS auto-fixed: ${FIX}`);
    expect(q(`[data-testid=upload-note-${FOG}]`)?.className).toContain("svg-note");
    expect(text(`[data-testid=upload-status-${FOG}]`)).toContain("Processed");
    expect(q(`[data-testid=upload-status-${FOG}] .svg-error`)).toBeNull();
    expect(text(`[data-testid=upload-status-${ARCH}]`)).toContain("Processed");
    expect(q(`[data-testid=upload-note-${ARCH}]`)).toBeNull();
  });
});

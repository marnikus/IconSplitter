// upload_download_ui.test.tsx — "Download all" on the SVG to upload tab
// (2026-10-08): the real panel over a fake folder that already holds two
// committed packages. The button counts the selection's committed files, the
// browser's folder picker names the destination, the bytes land there
// unchanged under the artifact names, a name already present is kept, a row
// never exported is reported, and a cancelled picker writes nothing.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { exportDirOf, newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint } from "../src/lib/upload/settings";
import { getLogState, resetLogStore } from "../src/log/logstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

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

const DIR = "architecture";
const FOG = pairId(`${DIR}/fog`, "fog", "");
const ARCH = pairId(`${DIR}/arch`, "arch", "");
const COURT = pairId(`${DIR}/court`, "court", "");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 24 24\n";

let host: HTMLDivElement;
let ui: Root;
let picker: ReturnType<typeof vi.fn>;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function waitFor(fn: () => boolean, label: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}
async function click(sel: string): Promise<void> {
  await waitFor(() => q(sel) !== null && (q(sel) as HTMLButtonElement).disabled !== true, `${sel} enabled`);
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}
async function check(id: string): Promise<void> {
  await waitFor(() => q(`[data-testid=upload-check-${id}]`) !== null, `row ${id}`);
  await act(async () => { (q(`[data-testid=upload-check-${id}]`) as HTMLInputElement).click(); });
  await settle();
}

/** A committed package on disk for `name` in its own pair folder: the artifacts + the record naming them. */
function commitPackage(dir: BinDir, dirPath: string, name: string, kinds: ("svg" | "jpg" | "eps")[]): void {
  const exp = new BinDir("export");
  dir.children.set("export", exp);
  const content = { svg: SVG, jpg: JPG, eps: EPS } as const;
  for (const k of kinds) exp.children.set(`${name}.${k}`, new BinFile(`${name}.${k}`, content[k], 5000));
  const record = newExportRecord({
    pair: { id: pairId(dirPath, name, ""), base: name, suffix: "", dir: dirPath },
    source: { svgPath: `${dirPath}/${name}_AI.svg`, version: 1, approval: "approved", fingerprint: "sha256:src" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS) },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: kinds.includes("eps"),
  });
  const out = (k: string) => ({ path: `${exportDirOf(dirPath)}/${name}.${k}`, bytes: 1, hash: "sha256:x" });
  record.outputs = { svg: kinds.includes("svg") ? out("svg") : null, jpg: kinds.includes("jpg") ? out("jpg") : null, eps: kinds.includes("eps") ? out("eps") : null };
  record.stage = "committed";
  record.status = "processed";
  exp.children.set("export.json", new BinFile("export.json", serializeExportRecord(record), 5001));
}

/** One pair per folder (the batch layout): fog (svg+jpg+eps) and arch (svg+jpg) committed; court approved, never exported. */
function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const arch = new BinDir(DIR);
  const packages: Record<string, ("svg" | "jpg" | "eps")[] | null> = { fog: ["svg", "jpg", "eps"], arch: ["svg", "jpg"], court: null };
  for (const [id, name] of [[FOG, "fog"], [ARCH, "arch"], [COURT, "court"]] as const) {
    const dirPath = `${DIR}/${name}`;
    const dir = new BinDir(name);
    dir.children.set(`${name}_AI.png`, new BinFile(`${name}_AI.png`, "ai", 3100));
    dir.children.set(`${name}_AI.svg`, new BinFile(`${name}_AI.svg`, SVG, 3400));
    const meta = pairFile(dirPath, `${name}_AI.png`, { id, versions: [svgVersion(`${dirPath}/${name}_AI.svg`, { version: 1, review: "approved" })] });
    dir.children.set(`${name}_AI.svg.json`, new BinFile(`${name}_AI.svg.json`, serializePairMeta(meta), 3300));
    const kinds = packages[name];
    if (kinds !== null) commitPackage(dir, dirPath, name, kinds);
    arch.children.set(name, dir);
  }
  root.children.set(DIR, arch);
  return root;
}

async function mount(root: BinDir): Promise<void> {
  stored.set("__upload__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitFor(() => q("[data-testid=upload-row-count]") !== null, "the list to render");
  await settle();
}

const bytesOf = (dir: BinDir, name: string) => (dir.children.get(name) as BinFile | undefined)?.bytes ?? null;

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  resetLogStore();
  forgetRestoreNote();
  picker = vi.fn();
  (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = picker;
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.restoreAllMocks();
});

describe("Download all — the selection's packages, one folder", () => {
  it("counts the selection's committed files, asks for a folder, and copies the bytes under the artifact names", async () => {
    const root = makeRoot();
    const dest = new BinDir("stock-drop");
    picker.mockResolvedValue(dest);
    await mount(root);
    const btn = () => q("[data-testid=upload-download-selected]") as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain("Download all (0 files)");

    await check(FOG);
    await check(COURT);
    expect(btn().disabled).toBe(false);
    expect(btn().textContent).toContain("Download all (3 files)"); // fog's three; court has no package yet

    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("Saved"), "the copy to finish");
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
    expect([...dest.children.keys()].sort()).toEqual(["fog.eps", "fog.jpg", "fog.svg"]);
    expect(bytesOf(dest, "fog.jpg")).toEqual(JPG); // byte for byte
    expect(new TextDecoder().decode(bytesOf(dest, "fog.svg")!)).toBe(SVG);
    expect(new TextDecoder().decode(bytesOf(dest, "fog.eps")!)).toBe(EPS);
    expect(text("[data-testid=upload-toast]")).toBe("Saved 3 files (1 icon) to stock-drop · 1 icon not exported yet");
    // the source packages are untouched, and the log has the outcome line (no data)
    const fogExport = ((root.children.get(DIR) as BinDir).children.get("fog") as BinDir).children.get("export") as BinDir;
    expect([...fogExport.children.keys()].sort()).toEqual(["export.json", "fog.eps", "fog.jpg", "fog.svg"]);
    const entry = getLogState().entries.find((e) => e.feature === "upload" && e.action === "downloaded");
    expect(entry?.detail).toContain("Saved 3 files");
    expect(entry?.data ?? {}).toEqual({}); // counts travel in the text, never as data
  });

  it("never overwrites: a name already in the folder is kept and reported; two icons go in one pass", async () => {
    const root = makeRoot();
    const dest = new BinDir("stock-drop");
    dest.children.set("arch.svg", new BinFile("arch.svg", "the user's own file", 1));
    picker.mockResolvedValue(dest);
    await mount(root);
    await check(FOG);
    await check(ARCH);
    expect(text("[data-testid=upload-download-selected]")).toContain("(5 files)");
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("Saved"), "the copy to finish");
    expect(text("[data-testid=upload-toast]")).toBe("Saved 4 files (2 icons) to stock-drop · 1 kept (already there)");
    expect(new TextDecoder().decode(bytesOf(dest, "arch.svg")!)).toBe("the user's own file");
    expect([...dest.children.keys()].sort()).toEqual(["arch.jpg", "arch.svg", "fog.eps", "fog.jpg", "fog.svg"]);
  });

  it("a cancelled picker writes nothing and says so; nothing selected is refused before any dialog", async () => {
    const root = makeRoot();
    picker.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await mount(root);
    await check(FOG);
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]") !== "", "the toast");
    expect(text("[data-testid=upload-toast]")).toContain("No folder chosen");
    expect(picker).toHaveBeenCalledTimes(1);
  });
});

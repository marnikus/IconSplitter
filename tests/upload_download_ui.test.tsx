import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";
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
import { getLogState, resetLogStore } from "../src/log/logstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import UploadPanel from "../src/upload/UploadPanel";
import { getAppState, setAppState, resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { commitPackage, PACKAGE_EPS as EPS, PACKAGE_JPG as JPG, PACKAGE_SVG as SVG, type PackageKind } from "./helpers/uploadpackage";
import { settle as quietSettle, waitUntil } from "./helpers/quiet";

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

let host: HTMLDivElement;
let ui: Root;
let picker: ReturnType<typeof vi.fn>;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = () => quietSettle(0);

const waitFor = (fn: () => boolean, label: string, ms = 8000) => waitUntil(fn, label, ms);
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

/** One pair per folder (the batch layout): fog (svg+jpg+eps) and arch (svg+jpg) committed; court approved, never exported. */
function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const arch = new BinDir(DIR);
  const packages: Record<string, PackageKind[] | null> = { fog: ["svg", "jpg", "eps"], arch: ["svg", "jpg"], court: null };
  for (const [id, name] of [[FOG, "fog"], [ARCH, "arch"], [COURT, "court"]] as const) {
    const dirPath = `${DIR}/${name}`;
    const dir = new BinDir(name);
    dir.children.set(`${name}_AI.png`, new BinFile(`${name}_AI.png`, "ai", 3100));
    dir.children.set(`${name}_AI.svg`, new BinFile(`${name}_AI.svg`, SVG, 3400));
    const meta = pairFile(dirPath, `${name}_AI.png`, { id, versions: [svgVersion(`${dirPath}/${name}_AI.svg`, { version: 1, review: "approved" })] });
    dir.children.set(`${name}_AI.svg.json`, new BinFile(`${name}_AI.svg.json`, serializePairMeta(meta), 3300));
    const kinds = packages[name];
    if (kinds !== null) commitPackage({ dir, dirPath, name, kinds });
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

/** Hold only destination readback, leaving actual writes/byte verification intact. */
function holdReadback(dest: BinDir): (() => void)[] {
  const releases: (() => void)[] = [];
  const original = BinFile.prototype.getFile;
  vi.spyOn(BinFile.prototype, "getFile").mockImplementation(async function (this: BinFile) {
    if (dest.children.get(this.name) === this) await new Promise<void>((resolve) => releases.push(resolve));
    return original.call(this);
  });
  return releases;
}

describe("Download all — the selection's packages, one folder", () => {
  it("reports verified per-file progress from zero to complete, with one sound and dismissible results", async () => {
    const dest = new BinDir("stock-drop"); const releases = holdReadback(dest);
    picker.mockResolvedValue(dest); await mount(makeRoot()); await check(FOG); recordCompletionAudio();
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => releases.length === 1, "first file awaiting verification");
    const track = () => q("[data-testid=upload-download-progress-track]");
    expect(track()).not.toBeNull();
    expect(track()!.getAttribute("aria-valuenow")).toBe("0");
    expect(text("[data-testid=upload-download-progress-file]")).toContain("fog.svg");
    expect(text("[data-testid=upload-download-progress-completed]")).toContain("0 completed / 3");
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      await act(async () => releases[i]());
      await waitFor(() => releases.length === i + 2, "next file awaiting verification");
      expect(track()!.getAttribute("aria-valuenow")).toBe(String(Math.round((i + 1) / 3 * 100)));
      expect(text("[data-testid=upload-download-progress-completed]")).toContain(`${i + 1} completed / 3`);
    }
    await act(async () => releases[2]());
    await waitFor(() => text("[data-testid=upload-download-progress-title]").includes("complete"), "download summary");
    expect(track()!.getAttribute("aria-valuenow")).toBe("100");
    expect(text("[data-testid=upload-download-progress-remaining]")).toContain("0 remaining");
    expect(q("[data-testid=upload-download-progress-cancel]")).toBeNull();
    expect(text("[data-testid=upload-toast]")).toContain("Saved 3 files");
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
    await click("[data-testid=upload-download-progress-dismiss]");
    expect(q("[data-testid=upload-download-progress-header]")).toBeNull();
    expect(dest.children.size).toBe(3);
  });

  it.each(["header", "toolbar"])("keeps progress outside a hidden panel; %s cancellation stops after verifying the active copy", async (control) => {
    const portal = document.createElement("div"); portal.id = "upload-progress-mount"; document.body.appendChild(portal);
    const dest = new BinDir("stock-drop"); const releases = holdReadback(dest);
    picker.mockResolvedValue(dest); await mount(makeRoot()); await check(FOG); recordCompletionAudio();
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => releases.length === 1, "active copy readback");
    host.hidden = true;
    const find = (suffix: string) => portal.querySelector(`[data-testid=upload-download-progress-${suffix}]`) as HTMLElement | null;
    expect(host.querySelector('[data-testid=upload-download-progress-header]')).toBeNull();
    expect(find("track")).not.toBeNull();
    await act(async () => { (control === "header" ? find("cancel") : q("[data-testid=upload-cancel-run]"))!.click(); });
    expect(releases).toHaveLength(1); // current file must still finish readback
    await act(async () => releases[0]());
    await waitFor(() => find("title")?.textContent?.includes("cancelled") === true, "cancelled summary");
    expect(find("track")!.getAttribute("aria-valuenow")).toBe("33");
    expect(find("completed")!.textContent).toContain("1 completed / 3");
    expect(find("remaining")!.textContent).toContain("2 remaining");
    expect([...dest.children.keys()]).toEqual(["fog.svg"]);
    expect(new TextDecoder().decode(bytesOf(dest, "fog.svg")!)).toBe(SVG);
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
    expect(text("[data-testid=upload-toast]")).toContain("cancelled");
    await act(async () => { find("dismiss")!.click(); });
    expect(find("header")).toBeNull(); portal.remove();
  });


  it("finishes and sounds once while hidden, and Review returns to Upload without copying again", async () => {
    const portal = document.createElement("div"); portal.id = "upload-progress-mount"; document.body.appendChild(portal);
    const dest = new BinDir("stock-drop"); const releases = holdReadback(dest);
    picker.mockResolvedValue(dest); await mount(makeRoot()); await check(FOG); recordCompletionAudio();
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => releases.length === 1, "first copy readback");
    await act(async () => { setAppState({ tab: "generateSvg" }); }); host.hidden = true;
    const find = (suffix: string) => portal.querySelector(`[data-testid=upload-download-progress-${suffix}]`) as HTMLElement | null;
    for (let i = 0; i < 3; i++) {
      await act(async () => releases[i]());
      if (i < 2) await waitFor(() => releases.length === i + 2, "next hidden copy");
    }
    await waitFor(() => find("title")?.textContent?.includes("complete") === true, "hidden completion summary");
    expect(find("track")!.getAttribute("aria-valuenow")).toBe("100");
    expect(host.querySelector('[data-testid=upload-download-progress-header]')).toBeNull();
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
    await act(async () => { find("review")!.click(); });
    expect(getAppState().tab).toBe("upload");
    expect(picker).toHaveBeenCalledTimes(1); expect(releases).toHaveLength(3);
    expect(dest.children.size).toBe(3); portal.remove();
  });

  it("counts kept, missing and failed files as settled, continues copying and retains an error summary", async () => {
    const root = makeRoot(); const dest = new BinDir("stock-drop");
    dest.children.set("arch.svg", new BinFile("arch.svg", "keep me"));
    const releases = holdReadback(dest); picker.mockResolvedValue(dest);
    await mount(root); await check(FOG); await check(ARCH); recordCompletionAudio();
    const archExport = (((root.children.get(DIR) as BinDir).children.get("arch") as BinDir).children.get("export") as BinDir);
    archExport.children.delete("arch.jpg"); // disappeared after the source was assembled
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => releases.length === 1, "first written file awaiting readback");
    const file = dest.children.get("fog.svg") as BinFile;
    file.bytes = new Uint8Array([0]); // destination corruption must fail real readback
    await act(async () => releases[0]());
    await waitFor(() => releases.length === 2, "copy continues after mismatch");
    expect(dest.children.has("fog.svg")).toBe(false); // failed write cleaned up
    await act(async () => releases[1]());
    await waitFor(() => releases.length === 3, "final copy readback");
    await act(async () => releases[2]());
    await waitFor(() => text("[data-testid=upload-download-progress-title]").includes("errors"), "failed download summary");
    expect(q("[data-testid=upload-download-progress-track]")!.getAttribute("aria-valuenow")).toBe("100");
    expect(text("[data-testid=upload-download-progress-completed]")).toContain("5 completed / 5");
    expect(text("[data-testid=upload-toast]")).toContain("2 files");
    expect(text("[data-testid=upload-toast]")).toContain("1 kept");
    expect(text("[data-testid=upload-toast]")).toContain("1 missing");
    expect(text("[data-testid=upload-toast]")).toContain("1 failed");
    expect(new TextDecoder().decode(bytesOf(dest, "arch.svg")!)).toBe("keep me");
    expect(bytesOf(dest, "fog.jpg")).toEqual(JPG);
    expect(new TextDecoder().decode(bytesOf(dest, "fog.eps")!)).toBe(EPS);
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  });

  it("reserves the picker/run against duplicate clicks and replaces the previous summary on a new run", async () => {
    const dest = new BinDir("stock-drop"); let choose: (d: BinDir) => void = () => undefined;
    picker.mockImplementation(() => new Promise<BinDir>((resolve) => { choose = resolve; }));
    await mount(makeRoot()); await check(FOG);
    // Both callbacks observe the same React snapshot; the run reservation must guard them.
    await act(async () => {
      q("[data-testid=upload-download-selected]")!.click();
      q("[data-testid=upload-download-selected]")!.click();
    });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(q("[data-testid=upload-download-progress-header]")).toBeNull(); // no copying before destination
    await act(async () => choose(dest));
    await waitFor(() => text("[data-testid=upload-download-progress-title]").includes("complete"), "first run complete");
    picker.mockResolvedValue(dest);
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("3 kept"), "new run completes without overwriting");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('[data-testid=upload-download-progress-header]')).toHaveLength(1);
    expect(text("[data-testid=upload-download-progress-completed]")).toContain("3 completed / 3");
  });

  it("does not create progress or sound for a selection without any exported files", async () => {
    const dest = new BinDir("stock-drop"); picker.mockResolvedValue(dest);
    await mount(makeRoot()); await check(COURT); recordCompletionAudio();
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("not exported yet"), "empty download outcome");
    expect(q("[data-testid=upload-download-progress-header]")).toBeNull();
    expect(dest.children.size).toBe(0);
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });

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

    recordCompletionAudio();
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("Saved"), "the copy to finish");
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
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
    recordCompletionAudio();
    await mount(root);
    await check(FOG);
    await click("[data-testid=upload-download-selected]");
    await waitFor(() => text("[data-testid=upload-toast]") !== "", "the toast");
    expect(text("[data-testid=upload-toast]")).toContain("No folder chosen");
    expect(picker).toHaveBeenCalledTimes(1);
    expect(q("[data-testid=upload-download-progress-header]")).toBeNull();
    await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
  });
});

// RULE 15 — shell/panel wiring is REAL behavior: tabs toggle, picker errors
// toast, presets round-trip through localStorage, invalid settings revert,
// and a full scan → review → confirm → process run executes through the UI
// over a fake FS. Only the folder picker, Image decode and toBlob are faked.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTextFile } from "../src/batch/fs";
import { parseStatus } from "../src/batch/status";
import Shell from "../src/ui/Shell";
import { FakeDir, paintSquare, restoreCanvas, seedDir, seedFile, seedRealFile, stubCanvasPaint, stubToBlobValue } from "./batch/fakes";

const PRESETS_KEY = "iconsplitter.presets.v1";
const LAST_KEY = "iconsplitter.preset.last.v1";

function clearPresets(): void {
  localStorage.removeItem(PRESETS_KEY);
  localStorage.removeItem(LAST_KEY);
}

function stubImage(): void {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 40;
      naturalHeight = 30;
      onload: (() => void) | null = null;
      set src(_u: string) {
        this.onload?.();
      }
    },
  );
}

function tree(): { root: FakeDir; cat: FakeDir } {
  const root = new FakeDir("root");
  const cat = seedDir(root, "Cat");
  seedFile(cat, "icon.png", "REF");
  seedRealFile(cat, "icon_AI.png", "AI1");
  seedRealFile(cat, "solo_AI.png", "AI2");
  return { root, cat };
}

function openBatch(): void {
  render(<Shell />);
  fireEvent.click(screen.getByTestId("tab-batch"));
}

beforeEach(() => {
  clearPresets();
});

afterEach(() => {
  cleanup();
  restoreCanvas();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  clearPresets();
});

describe("shell tabs", () => {
  it("shows the sheet editor first; the batch tab reveals the panel", () => {
    render(<Shell />);
    const picker = screen.getByTestId("batch-source-picker");
    expect(picker.closest("div[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByTestId("tab-batch"));
    expect(picker.closest("div[hidden]")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-sheets"));
    expect(picker.closest("div[hidden]")).not.toBeNull();
  });
});

describe("batch panel wiring", () => {
  it("explains when the browser has no folder picker", async () => {
    openBatch();
    fireEvent.click(screen.getByTestId("batch-source-picker"));
    const toast = await screen.findByTestId("batch-toast", undefined, { timeout: 5000 });
    expect(toast.textContent).toBe("Folder picking needs Chrome or Edge");
  });

  it("keeps process disabled with nothing selected", () => {
    openBatch();
    expect((screen.getByTestId("batch-process") as HTMLButtonElement).disabled).toBe(true);
  });

  it("preset save-as, load-last and delete round-trip through the list", () => {
    openBatch();
    expect((screen.getByTestId("batch-auto-select") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId("batch-preset-name"), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId("batch-preset-save-as"));
    const list = screen.getByTestId("batch-preset-list") as HTMLSelectElement;
    expect(list.querySelector('option[value="t1"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId("batch-auto-select"));
    expect((screen.getByTestId("batch-auto-select") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("batch-preset-load-last"));
    expect((screen.getByTestId("batch-auto-select") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId("batch-preset-list"), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId("batch-preset-delete"));
    expect((screen.getByTestId("batch-preset-list") as HTMLSelectElement).querySelector('option[value="t1"]')).toBeNull();
  });

  it("reverts an invalid output folder name with an error toast", async () => {
    openBatch();
    const input = screen.getByTestId("batch-output-dir") as HTMLInputElement;
    expect(input.value).toBe("_split_output");
    fireEvent.change(input, { target: { value: "a/b" } });
    fireEvent.blur(input);
    const toast = await screen.findByTestId("batch-toast", undefined, { timeout: 5000 });
    expect(toast.textContent).toContain("reverted");
    expect((screen.getByTestId("batch-output-dir") as HTMLInputElement).value).toBe("_split_output");
  });
});

describe("batch end to end through the UI", () => {
  it("scan → review → confirm → process writes outputs and status files", async () => {
    stubImage();
    stubCanvasPaint(paintSquare);
    stubToBlobValue(new Blob(["P"], { type: "image/png" }));
    const { root, cat } = tree();
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => root;

    openBatch();
    fireEvent.click(screen.getByTestId("batch-source-picker"));

    const row0 = await screen.findByTestId("batch-row-0", undefined, { timeout: 8000 });
    const row1 = await screen.findByTestId("batch-row-1", undefined, { timeout: 8000 });
    expect(row0.textContent).toContain("ref: icon.png");
    expect(row1.textContent).toContain("solo.png (missing)");
    expect(screen.getByTestId("batch-process").textContent).toContain("(2)");

    fireEvent.click(screen.getByTestId("batch-process"));
    await screen.findByTestId("batch-missing-skip", undefined, { timeout: 8000 });
    fireEvent.click(screen.getByTestId("batch-missing-continue"));
    await waitFor(() => expect(screen.queryByTestId("batch-busy-overlay")).toBeNull(), { timeout: 15000 });

    expect(root.dirs.has("_split_output")).toBe(true);
    const status = parseStatus(JSON.parse((await readTextFile(cat, "icon.json"))!));
    expect(status?.images.map((t) => t.relPath)).toEqual(["Cat/icon_AI.png"]);
  }, 20000);
});

// sheets_toast.test.tsx — the status toast of the Single sheets tab, driven
// through the REAL shell and the REAL upload handler (RULE 8). Written BEFORE
// the toast moved out of App.tsx into ui/useToast.ts (P0 of the 2026-10-01
// design): nothing exercised it, and App.tsx is a legacy file that may not grow.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";

// This DOM never settles an image load, so the decoder is made to fail the way
// a corrupt file does in a browser.
vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return { ...actual, loadImage: vi.fn(async () => { throw new Error("decode failed"); }) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<Workbench />); });
});

afterEach(async () => {
  await act(async () => { ui.unmount(); });
  host.remove();
  vi.useRealTimers();
});

/** Hands the hidden file input a file the way a picker would. */
async function upload(file: File): Promise<void> {
  const input = q("[data-testid=file-input]") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

const notImage = () => new File(["hello"], "notes.txt", { type: "text/plain" });

describe("the single-sheets toast", () => {
  it("is absent until something is said", () => {
    expect(q("[data-testid=toast]")).toBeNull();
  });

  it("explains a rejected upload in a red toast", async () => {
    await upload(notImage());
    const toast = q("[data-testid=toast]");
    expect(toast?.textContent).toBe("Please choose image files (PNG, JPG, WEBP…)");
    expect(toast?.className).toContain("bg-rose-600");
    expect(toast?.className).not.toContain("bg-emerald-600");
  });

  it("names the file whose image could not be read, and lifts the busy overlay", async () => {
    await upload(new File(["not really a png"], "bad.png", { type: "image/png" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(q("[data-testid=toast]")?.textContent).toBe("bad.png: decode failed");
    expect(q("[data-testid=toast]")?.className).toContain("bg-rose-600");
    expect(q("[data-testid=busy-overlay]")).toBeNull();
  });

  it("clears itself after 3.2 seconds", async () => {
    vi.useFakeTimers();
    await upload(notImage());
    await act(async () => { vi.advanceTimersByTime(3199); });
    expect(q("[data-testid=toast]")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(q("[data-testid=toast]")).toBeNull();
  });

  it("restarts the clock when a newer message replaces it", async () => {
    vi.useFakeTimers();
    await upload(notImage());
    await act(async () => { vi.advanceTimersByTime(2000); });
    await upload(notImage());
    await act(async () => { vi.advanceTimersByTime(1300); }); // 3.3 s after the first, 1.3 s after the second
    expect(q("[data-testid=toast]")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(1900); });
    expect(q("[data-testid=toast]")).toBeNull();
  });
});

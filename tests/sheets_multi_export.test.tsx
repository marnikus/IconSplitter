import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakeDir } from "./helpers/fakefs";
import { waitUntil } from "./helpers/quiet";
import { click, mountWithSheets, q } from "./helpers/sheetsHarness";

// JSZip runs in Node's realm, whose FileReader cannot read happy-dom Blobs;
// normalize only that I/O seam (as in sheets_completion_sound.test.tsx).
const zipOut = vi.hoisted(() => ({ bytes: null as Uint8Array | null }));
vi.mock("jszip", async (original) => {
  const actual = await original<{ default: typeof import("jszip") }>();
  const BrowserZip = function BrowserZip() {
    const zip = new actual.default();
    const add = zip.file.bind(zip);
    zip.file = ((name: string, blob: Blob) => add(name, blob.arrayBuffer().then((b) => new Uint8Array(b)))) as typeof zip.file;
    const generate = zip.generateAsync.bind(zip);
    zip.generateAsync = (async (o: Parameters<typeof zip.generateAsync>[0]) => {
      zipOut.bytes = await generate({ ...o, type: "uint8array" });
      return new Blob(["zip"]);
    }) as typeof zip.generateAsync;
    return zip;
  } as unknown as typeof actual.default;
  BrowserZip.loadAsync = actual.default.loadAsync.bind(actual.default);
  return { default: BrowserZip };
});

let cleanup: (() => Promise<void>) | null = null;
beforeEach(() => { localStorage.clear(); });
afterEach(async () => {
  await cleanup?.(); cleanup = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

async function saveToFolder(host: HTMLElement) {
  const dest = new FakeDir("destination");
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => dest;
  await click(q(host, "export-folder"));
  await waitUntil(() => /Saved \d+ icons/.test(host.textContent ?? ""), "folder export");
  return dest;
}

const names = (d: FakeDir) => [...d.children.keys()].sort();
const sheetChecks = (host: HTMLElement) => [...host.querySelectorAll('[data-testid^="sheet-check-"]:not([data-testid="sheet-check-all"])')];

it("Save to folder writes every sheet's icons, one sub-folder per sheet", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  const dest = await saveToFolder(m.host);
  expect(names(dest)).toEqual(["a", "b", "c"]);
  for (const sub of dest.children.values()) expect(names(sub as FakeDir)).toHaveLength(2);
});

it("export is limited to checked sheets and their included icons", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  const ids = sheetChecks(m.host);
  expect(ids).toHaveLength(3);
  await click(ids[1]); // uncheck b
  await click(m.host.querySelector('[data-testid^="sheet-row-"]')); // activate a
  await click(q(m.host, "result-check-1")); // exclude a's 2nd icon
  expect(q(m.host, "export-zip")!.textContent).toContain("(3)");
  const dest = await saveToFolder(m.host);
  expect(names(dest)).toEqual(["a", "c"]);
  expect(names(dest.children.get("a") as FakeDir)).toEqual(["a-icon-01.png"]);
});

it("ZIP contains every checked sheet", async () => {
  const m = await mountWithSheets(["a.png", "b.png"]); cleanup = m.unmount;
  await click(q(m.host, "export-zip"));
  await waitUntil(() => /ZIP with 4 icons/.test(m.host.textContent ?? ""), "zip export");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipOut.bytes!);
  expect(m.downloads).toHaveBeenCalledOnce();
  expect(Object.keys(zip.files).filter((f) => !f.endsWith("/")).sort())
    .toEqual(["a/a-icon-01.png", "a/a-icon-02.png", "b/b-icon-01.png", "b/b-icon-02.png"]);
});

it("there is no separate Download files button", async () => {
  const m = await mountWithSheets(["a.png"]); cleanup = m.unmount;
  expect(q(m.host, "export-download")).toBeNull();
});

it("clicking a result image toggles its exclusion and keeps it visible", async () => {
  const m = await mountWithSheets(["a.png"]); cleanup = m.unmount;
  await click(q(m.host, "result-image-0"));
  expect((q(m.host, "result-check-0") as HTMLInputElement).checked).toBe(false);
  expect(q(m.host, "result-image-0")).not.toBeNull();
  expect(q(m.host, "export-zip")!.textContent).toContain("(1)");
  await click(q(m.host, "result-image-0"));
  expect((q(m.host, "result-check-0") as HTMLInputElement).checked).toBe(true);
});

it("merge distance shows its value and accepts a typed number", async () => {
  const m = await mountWithSheets(["a.png"]); cleanup = m.unmount;
  const field = q(m.host, "merge-input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "60");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await waitUntil(() => q(m.host, "merge-value")!.textContent === "15.00%", "typed merge clamped and applied");
  await waitUntil(() => /Found 1 icon\b/.test(m.host.textContent ?? ""), "large merge joins both squares");
  expect((q(m.host, "merge-slider") as HTMLInputElement).value).toBe("0.15");
});

it("a merge change on a checked sheet applies to every checked sheet", async () => {
  const m = await mountWithSheets(["a.png", "b.png", "c.png"]); cleanup = m.unmount;
  await click(sheetChecks(m.host)[2]); // uncheck c
  const slider = q(m.host, "merge-slider") as HTMLInputElement;
  await click(m.host.querySelector('[data-testid^="sheet-row-"]'));
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0.15");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitUntil(() => q(m.host, "export-zip")!.textContent!.includes("(2)"), "a and b merged to one icon each");
  expect(q(m.host, "merge-scope")!.textContent).toContain("2 checked sheets");
});

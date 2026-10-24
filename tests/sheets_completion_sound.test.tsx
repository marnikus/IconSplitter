import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { setCompletionSound } from "../src/ui/completionSound";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";
import { FakeDir } from "./helpers/fakefs";
import { waitUntil } from "./helpers/quiet";

// JSZip executes in Node's realm here, whose FileReader cannot consume happy-dom
// Blob. Normalize just that browser-I/O seam; ZIP compression itself stays real.
vi.mock("jszip", async (original) => {
  const actual = await original<{ default: typeof import("jszip") }>();
  return { default: function BrowserZip() {
    const zip = new actual.default();
    const add = zip.file.bind(zip);
    zip.file = ((name: string, blob: Blob) => add(name, blob.arrayBuffer().then((bytes) => new Uint8Array(bytes)))) as typeof zip.file;
    const generate = zip.generateAsync.bind(zip);
    zip.generateAsync = (async (options: Parameters<typeof zip.generateAsync>[0]) => {
      const bytes = await generate({ ...options, type: "uint8array" });
      return new Blob([Uint8Array.from(bytes).buffer]);
    }) as typeof zip.generateAsync;
    return zip;
  } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Browser image/canvas I/O: real detection and rendering execute on synthetic ink. */
function installSheetCanvas() {
  class LoadedImage {
    naturalWidth = 32; naturalHeight = 32; onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("Image", LoadedImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    drawImage() {}, fillRect() {}, putImageData() {},
    getImageData(_x: number, _y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4).fill(255);
      for (let y = 8; y < Math.min(24, h); y++) for (let x = 8; x < Math.min(24, w); x++) {
        const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
      }
      return { data };
    },
  } as unknown as CanvasRenderingContext2D));
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,eA==");
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"])));
  return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}

beforeEach(() => { localStorage.clear(); setCompletionSound(true); recordCompletionAudio(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker; });
async function importedSheet() {
  const downloads = installSheetCanvas();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); await act(async () => root.render(<HistoryProvider><App /></HistoryProvider>));
  const input = host.querySelector('[data-testid="file-input"]')!;
  Object.defineProperty(input, "files", { value: [new File(["synthetic"], "sheet.png", { type: "image/png" })] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await waitUntil(() => !(host.querySelector('[data-testid="export-zip"]') as HTMLButtonElement).disabled, "sheet detection");
  await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(1);
  completionAudio.starts.length = 0;
  return { host, downloads };
}

it.each(["zip", "folder", "download"])("Single sheets %s cues after the real export finishes", async (kind) => {
  const { host, downloads } = await importedSheet();
  const dest = new FakeDir("destination");
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => dest;
  await act(async () => { (host.querySelector(`[data-testid="export-${kind}"]`) as HTMLElement).click(); });
  await waitUntil(() => completionAudio.starts.length === 1, `${kind} completion cue`);
  if (kind === "folder") expect(dest.children.size).toBe(1);
  else expect(downloads, host.textContent ?? "").toHaveBeenCalledOnce();
  expect(completionAudio.starts).toHaveLength(1);
});

it("Single sheets folder picker cancellation does not masquerade as a finished export", async () => {
  const { host } = await importedSheet();
  (window as unknown as { showDirectoryPicker: () => Promise<never> }).showDirectoryPicker = async () => { throw new DOMException("cancelled", "AbortError"); };
  await act(async () => { (host.querySelector('[data-testid="export-folder"]') as HTMLElement).click(); await new Promise((r) => setTimeout(r, 35)); });
  await flushCompletionAudio(); expect(completionAudio.starts).toHaveLength(0);
});

// Shared Single-sheets harness: browser image/canvas I/O is stubbed, while real
// detection, rendering, export collection and the App UI execute (RULE 8).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";
import App from "../../src/App";
import { HistoryProvider } from "../../src/state/HistoryProvider";
import { waitUntil } from "./quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A 64×32 sheet with two separate ink squares → two detected icons. */
export function installSheetCanvas() {
  class LoadedImage {
    naturalWidth = 64; naturalHeight = 32; onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("Image", LoadedImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    drawImage() {}, fillRect() {}, putImageData() {},
    getImageData(_x: number, _y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4).fill(255);
      const ink = (x0: number) => {
        for (let y = 8; y < Math.min(24, h); y++) for (let x = x0; x < Math.min(x0 + 16, w); x++) {
          const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
        }
      };
      ink(4); ink(44);
      return { data };
    },
  } as unknown as CanvasRenderingContext2D));
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,eA==");
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"])));
  return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}

export const q = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

/** Renders App and imports the named sheets; resolves once all are detected. */
export async function mountWithSheets(names: string[]) {
  const downloads = installSheetCanvas();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<HistoryProvider><App /></HistoryProvider>));
  const input = q(host, "file-input")!;
  Object.defineProperty(input, "files", { value: names.map((n) => new File(["synthetic"], n, { type: "image/png" })) });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await waitUntil(() => (host.textContent ?? "").includes(`Sheets (${names.length})`)
    && !q(host, "busy-overlay"), "sheet detection");
  return { host, downloads, unmount: () => act(async () => root.unmount()) };
}

export async function click(el: Element | null, init: MouseEventInit = {}) {
  if (!el) throw new Error("element not found");
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })); });
}

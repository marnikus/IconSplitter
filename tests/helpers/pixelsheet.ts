// pixelsheet.ts — the browser-API stubs the DOM suites need to run the REAL
// pipeline (RULE 8): Image decoding, the 2D context and the blob/data-URL gates.
// Nothing of src/lib is mocked; every line of analyze/detect/renderIcon executes
// over the synthetic pixels served here.

import { vi } from "vitest";

/** A 40×40 white sheet with two 6×6 ink blobs 3 px apart: detect() sees TWO icons
 *  at merge 0 and ONE at the app's auto radius (0.125). */
export function twoBlobPixels(w: number, h: number): Uint8ClampedArray {
  const ink = (x: number, y: number) => (x >= 8 && x <= 13 && y >= 10 && y <= 15) || (x >= 17 && x <= 22 && y >= 10 && y <= 15);
  return paint(w, h, ink);
}

export function paint(w: number, h: number, ink: (x: number, y: number) => boolean): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = ink(x, y) ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

export class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth: number;
  naturalHeight: number;
  constructor(w = 40, h = 40) {
    this.naturalWidth = w;
    this.naturalHeight = h;
  }
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Installs the stubs for one test (vi.restoreAllMocks + vi.unstubAllGlobals undo it). */
export function stubPixelPipeline(pixels: (w: number, h: number) => Uint8ClampedArray = twoBlobPixels, size = 40): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    imageSmoothingQuality: "", fillStyle: "", drawImage: vi.fn(), fillRect: vi.fn(), putImageData: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: pixels(w, h) }),
  })) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AA");
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
  vi.stubGlobal("Image", class extends StubImage {
    constructor() {
      super(size, size);
    }
  });
}

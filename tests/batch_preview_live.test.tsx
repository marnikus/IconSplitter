// batch_preview_live.test.tsx — the LIVE path, with no injected work: the shipped
// previewdeps.readStrip, the shipped session hook, the shipped row wiring and the
// shipped store. This file exists because the injected-deps suite (batch_preview_ui)
// structurally cannot see the bug that broke the feature in a real browser: the
// harness there hands the panel ONE stable deps object, while the live path built a
// fresh one on every render — which rebuilt the session on every render, closed the
// previous one (revoking every strip URL: no previews ever appeared), restarted the
// whole plan four times a second (the tab froze) and made Stop meaningless (the
// stopped session was already being replaced). 2026-10-12.
//
// What is asserted here is therefore about the wiring, not the pixels: strips really
// get painted, each row is read exactly once, unrelated re-renders change nothing,
// Stop holds, and pressing Preview again replays the strips already computed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";

/** Shared with the module mock below (hoisted so the factory can reach it). */
const live = vi.hoisted(() => ({ reads: 0, delayMs: 0, img: { naturalWidth: 40, naturalHeight: 20 } }));

vi.mock("../src/lib/dom", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...real,
    // The decode is the only IO the live path does per row; counting it is how this
    // file proves "one read per row" and "no work after Stop".
    loadImageFile: async (): Promise<HTMLImageElement> => {
      live.reads += 1;
      if (live.delayMs) await new Promise((r) => setTimeout(r, live.delayMs));
      return live.img as unknown as HTMLImageElement;
    },
  };
});

import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";
import { patchBatch } from "../src/state/appstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

type Rgba = (x: number, y: number) => [number, number, number, number];

/** A sheet with `n` black icons on white, one row — three icons per fake row. */
function sheet(n: number): Rgba {
  const pitch = 24;
  return (x, y) => {
    const col = Math.floor(x / pitch);
    const inIcon = col < n && x % pitch >= 4 && x % pitch < 20 && y >= 4 && y < 20;
    return inIcon ? [0, 0, 0, 255] : [255, 255, 255, 255];
  };
}

/** The canvas the real analyze/render code draws into, with a painted mask. */
function stubCanvas(paint: Rgba) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    return {
      imageSmoothingQuality: "",
      fillStyle: "",
      drawImage: () => undefined,
      fillRect: () => undefined,
      putImageData: () => undefined,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const [r, g, b, a] = paint(x % 40, y % 20);
            const i = (y * w + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
          }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

const ROWS = ["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-c_AI_3.png"];

function makeRoot(): FakeDir {
  const root = new FakeDir("live_preview_root");
  for (const name of ROWS) {
    root.children.set(name, new FakeFile(name, 10, 1000, "x"));
    root.children.set(name.replace("_AI_", "_").replace(/_\d+\.png$/, ".png"), new FakeFile("ref.png", 5, 1000, "r"));
  }
  return root;
}

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const byId = (id: string) => `[data-testid="${id}"]`;
const settle = async (ms = 80) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const click = async (el: Element | null) => {
  if (!el) throw new Error("click target missing");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

/** Mounts the REAL panel — no preview seam: the live deps are the thing under test. */
async function mountLive(root: FakeDir) {
  (window as unknown as PickerWindow).showDirectoryPicker = async () => root as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(<BatchPanel />);
  });
  await settle(60);
  await click(q(byId("batch-open-folder")));
  await settle(400);
  if (host.querySelectorAll(".batch-row").length === 0) throw new Error("scan found no rows in the fake root");
  await click(q(byId("batch-select-visible")));
  await settle(80);
}

function countText(rel: string): string {
  return host.querySelector(byId(`batch-preview-count-${rel}`))?.textContent ?? "";
}

function imagesFor(rel: string): number {
  return host.querySelectorAll(`[data-testid="batch-preview-img-${rel}"]`).length;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify({ thumb: 220 }));
  await dropDb();
  clearKnownRoots();
  live.reads = 0;
  live.delayMs = 0;
  if (host) {
    await act(async () => ui.unmount());
    host.remove();
  }
  delete (window as Partial<PickerWindow>).showDirectoryPicker;
  vi.restoreAllMocks();
  stubCanvas(sheet(3));
});

describe("Preview splits — the live path (no injected deps)", () => {
  it("paints a strip and a count for every selected row through the real pipeline", async () => {
    await mountLive(makeRoot());
    await click(q(byId("batch-preview")));
    await settle(400);
    for (const rel of ROWS) {
      expect(imagesFor(rel), `${rel} has no preview image`).toBeGreaterThan(0);
      // The fake sheet paints two icons inside the 40px window the analyzer reads;
      // what matters here is that a REAL count reached the row (batch_preview_parity
      // owns the "same number as the split" claim).
      expect(countText(rel)).toMatch(/^\d+ icons$/);
    }
    expect(live.reads).toBe(ROWS.length);
    expect(q(byId("batch-preview-progress"))?.textContent).toMatch(/3\/3 rows/);
  });

  it("reads each row once and keeps the session across unrelated re-renders", async () => {
    await mountLive(makeRoot());
    await click(q(byId("batch-preview")));
    await settle(400);
    expect(live.reads).toBe(ROWS.length);
    // An unrelated state change (which row is active) and then a second of idle time:
    // neither may restart the plan. The old wiring rebuilt the session on every render,
    // so this count grew forever — four restarts a second, each one re-reading rows.
    await act(async () => {
      patchBatch({ activeId: "icon-b_ai_2.png" });
    });
    for (let i = 0; i < 3; i++) {
      await settle(400);
      expect(live.reads, `rows re-read after ${(i + 1) * 400}ms of idle`).toBe(ROWS.length);
    }
    for (const rel of ROWS) expect(imagesFor(rel)).toBeGreaterThan(0); // still painted, not revoked
  });

  it("Stop really stops: the row in flight is the last one read", async () => {
    await mountLive(makeRoot());
    live.delayMs = 400; // slow reads, so Stop lands on a row that is still in flight
    await click(q(byId("batch-preview")));
    await settle(200);
    expect(live.reads).toBe(1); // exactly one row is being read
    await click(q(byId("batch-preview-stop")));
    await settle(1500);
    expect(live.reads, "a stopped session kept reading rows").toBe(1);
    expect(q(byId("batch-preview-stop"))).toBeNull(); // the session is not running any more
    expect(q(byId("batch-preview-progress"))?.textContent).toMatch(/0\/3 rows/);
    expect(countText("icon-b_AI_2.png")).toBe("Not previewed");
    expect(imagesFor("icon-b_AI_2.png")).toBe(0);
  });

  it("previewing again after Stop resumes: the finished row is replayed, not re-read", async () => {
    await mountLive(makeRoot());
    live.delayMs = 400;
    await click(q(byId("batch-preview")));
    await settle(500); // row 1 done, row 2 in flight
    expect(live.reads).toBe(2);
    expect(countText(ROWS[0])).toMatch(/^\d+ icons$/);
    await click(q(byId("batch-preview-stop")));
    await settle(300);
    expect(countText(ROWS[1])).toBe("Not previewed"); // the row in flight never finished
    live.delayMs = 0;
    await click(q(byId("batch-preview"))); // the button works again after Stop
    await settle(400);
    // Row 1 came from the cache; only the two rows that never finished were read.
    expect(live.reads).toBe(4);
    for (const rel of ROWS) {
      expect(countText(rel), `${rel} was not previewed`).toMatch(/^\d+ icons$/);
      expect(imagesFor(rel)).toBeGreaterThan(0);
    }
  });
});

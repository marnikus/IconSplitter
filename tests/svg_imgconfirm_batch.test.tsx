import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_CONNECTION } from "../src/lib/svgconnections";
import SvgImgConfirm from "../src/svg/SvgImgConfirm";
import type { PreparedImageRun } from "../src/svg/imgprepare";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const rows = ["a", "b", "c", "d"].map((id) => ({
  source: { id, name: `${id}.png`, relPath: `${id}.png`, dirPath: "", stem: id, metaPath: `${id}.svg.json` },
  meta: null, corrupt: false,
})) as unknown as SvgRow[];
const folder = () => {
  const root = new FakeDir("icons");
  for (const id of ["a", "b", "c", "d"]) root.children.set(`${id}.png`, new FakeFile(`${id}.png`, 4, 1, id));
  return root;
};
const refs = () => ({ current: folder() });
const wait = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); }); };
let host: HTMLDivElement;
let ui: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal("createImageBitmap", async () => ({ width: 100, height: 100, close: () => undefined }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview-1") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    fillStyle: "", fillRect: () => undefined, drawImage: () => undefined,
  }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["COMPOSITE"], { type: "image/png" })));
});

afterEach(async () => {
  if (ui) await act(async () => ui.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-icon image-edit confirmation", () => {
  it("shows the exact uploaded sheet, order, count, provider and effective prompt before send", async () => {
    const sent: PreparedImageRun[] = [];
    const rootRef = refs();
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgImgConfirm ids={["c", "a", "d", "b"]} rows={rows} rootRef={rootRef}
        conn={DEFAULT_IMAGE_CONNECTION} presets={[]} prompt="Make thin lines" waitMs={300000}
        onPrompt={() => undefined} onPickPreset={() => undefined} onConfirm={(run) => { if (run) sent.push(run); }} onCancel={() => undefined} />);
    });
    await wait();
    expect((host.querySelector("[data-testid=svg-img-per-request]") as HTMLInputElement).value).toBe("4");
    expect(host.querySelector("[data-testid=svg-img-composite] img")?.getAttribute("src")).toBe("blob:preview-1");
    expect(host.querySelector("[data-testid=svg-img-manifest]")?.textContent).toMatch(/1.*c\.png.*2.*a\.png.*3.*d\.png.*4.*b\.png/s);
    expect(host.querySelector("[data-testid=svg-img-effective-prompt]")?.textContent).toMatch(/same cell positions/i);
    expect(host.querySelector("[data-testid=svg-img-provider]")?.textContent).toMatch(/Sunburst/);
    await act(async () => (host.querySelector("[data-testid=svg-img-generate]") as HTMLButtonElement).click());
    expect(sent).toHaveLength(1);
    expect(await sent[0].groups[0].reference.text()).toBe("COMPOSITE");
    expect(sent[0].groups[0].plan.cells.map((cell) => cell.id)).toEqual(["c", "a", "d", "b"]);
  });
});

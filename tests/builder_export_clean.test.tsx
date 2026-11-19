// @vitest-environment happy-dom
// builder_export_clean.test.tsx — the clean-up control and what it changes
// (2026-11-19). The user's ask: "clean up export — add these filters to clean
// final EPS and SVG before they are saved", as a CHECKBOX in the export
// settings, applied to BOTH formats. This pins the whole path: the row exists
// in the popup, one gesture persists it, the builder's package loses the
// fingerprints (data-*, repeated xmlns, float junk), keeps only title/
// description/tags in the SVG, and writes an EPS with no producer identity.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { builderFormatDefaults, loadBuilderFormats } from "../src/svgBuilder/formatstore";
import { builderExportSettings } from "../src/svgBuilder/formatwiring";
import { buildSheetPackage, type SheetPackageArgs } from "../src/svgBuilder/sheetpackage";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { verifyEpsDocument } from "../src/lib/upload/epsdoc";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";
import { minimalJpeg } from "./helpers/minijpeg";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, saveHandles: vi.fn(async () => {}), loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';

function library(): FakeDir {
  const root = new FakeDir("icons");
  const dir = new FakeDir("interface");
  for (const stem of ["home", "gear"]) {
    const meta = serializePairMeta(pairFile("interface", `${stem}_AI.png`, {
      versions: [svgVersion(`interface/${stem}_AI.svg`, { version: 1, review: "approved" })],
    }));
    dir.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
    dir.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
    dir.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
  }
  root.children.set("interface", dir);
  return root;
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (id: string) => {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => library();
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

async function openPopup(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
  await click("builder-format-open");
}

describe("the clean-up checkbox in the builder's export settings", () => {
  it("exists in the popup, is on by default, and one gesture turns it off", async () => {
    await openPopup();
    const row = q("bld-set-clean");
    expect(row).not.toBeNull();
    expect(loadBuilderFormats().cleanExport).toBe(true);
    await click("bld-set-clean");
    expect(loadBuilderFormats().cleanExport).toBe(false);
    expect(JSON.parse(localStorage.getItem("iconSplitter.builder.formats.v1") ?? "{}")).toMatchObject({ cleanExport: false });
  });
});

/** A composed-sheet stand-in carrying every fingerprint the review listed. */
const DIRTY = [
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" viewBox="0 0 200 100"',
  ' data-config-fingerprint="7db67cc0" data-approved-only="1">',
  '<metadata>{"v":1,"approvedOnly":true,"configFingerprint":"7db67cc0"}</metadata>',
  '<g xmlns="http://www.w3.org/2000/svg" data-asset-id="pair_7db67cc0" role="img" transform="translate(1.9992750000000001 0)">',
  '<rect xmlns="http://www.w3.org/2000/svg" x="1.0000000001" y="1" width="9" height="9" fill="none" stroke="#000" stroke-width="2"/></g>',
  "</svg>",
].join("");

const META = { title: "Quiet line icons", description: "Line icons of kitchen tools", tags: ["icon", "kitchen"] };

function args(patch: Partial<SheetPackageArgs["settings"]> = {}): SheetPackageArgs {
  return {
    svg: DIRTY, metadata: { state: "accepted", ...META, validation: null, fingerprint: null },
    // what the Export action really feeds the package: the builder's stored formats
    settings: builderExportSettings({ ...builderFormatDefaults(), optimizeSvg: false, ...patch }),
    folder: "_artboard_sheets/t/a", stem: "sheet", pairId: "a1", now: "2026-11-19T00:00:00.000Z", prompt: "p", model: "m",
  };
}

const deps = {
  pngBlob: async () => new Blob(["png"]),
  rasterize: async () => ({ ok: true as const, jpeg: minimalJpeg(200, 100) }),
};

const file = (pkg: Awaited<ReturnType<typeof buildSheetPackage>>, ext: string) => pkg.files.find((f) => f.name.endsWith(ext));
const textOf = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes ?? new Uint8Array());

describe("the delivered sheet files are clean", () => {
  it("the SVG loses the fingerprints and keeps only title, description and tags", async () => {
    const pkg = await buildSheetPackage(args(), deps);
    const svg = textOf(file(pkg, ".svg")?.bytes);
    expect(svg).not.toContain("data-config-fingerprint");
    expect(svg).not.toContain("data-asset-id");
    expect(svg).not.toContain("7db67cc0");
    expect(svg).not.toContain("1.9992750000000001");
    expect(svg.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1);
    expect(readEmbeddedMetadata(svg)).toEqual(META);
  });

  it("writes a real EPS for the delivered file: no producer identity, one carrier", async () => {
    setTextOutliner(() => ({ d: "M0 0 L40 0", width: 40 }));
    const { writeEps } = await import("../src/lib/upload/eps");
    const built = writeEps('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="1" y="1" width="9" height="9" fill="#000"/></svg>', "#ffffff", { title: "sheet.eps", createdAt: "2026-11-19T00:00:00Z" });
    expect(built.ok).toBe(true);
    const pkg = await buildSheetPackage(args({ includeEps: true }), { ...deps, eps: async () => ({ ok: true as const, eps: built.ok ? built.eps : "", writer: "builtin@test", fixes: [] }) });
    setTextOutliner(null);
    const eps = textOf(file(pkg, ".eps")?.bytes);
    expect(eps).not.toBe("");
    expect(eps).not.toContain("IconSplitter");
    expect(eps).not.toContain("%%Creator");
    expect(eps).not.toContain("%%CreationDate");
    expect(eps).not.toContain("%%BeginPhotoshop");
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    expect(readEpsIptc(eps)).toBeNull();
    expect(verifyEpsDocument(eps).ok).toBe(true);
  });

  it("off, both files ship exactly as before — the fingerprint survives", async () => {
    const pkg = await buildSheetPackage(args({ cleanExport: false }), deps);
    const svg = textOf(file(pkg, ".svg")?.bytes);
    expect(svg).toContain("data-config-fingerprint");
    expect(readEmbeddedMetadata(svg)).toEqual(META);
  });
});

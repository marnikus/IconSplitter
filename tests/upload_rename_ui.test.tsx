// @vitest-environment happy-dom
// upload_rename_ui.test.tsx — end-to-end Workbench UI contract for renaming
// exported upload files across all 3 tabs: SVG builder, SVG to upload, and Upload.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { loadBuilderFormats, saveBuilderFormats } from "../src/svgBuilder/formatstore";
import { saveUploadSettings, loadUploadSettings } from "../src/upload/settingsstore";
import { rememberMeta } from "../src/upload/metacache";
import { clearUploadNamesInMemory } from "../src/upload/uploadnamestore";
import { resetAllRenameProgress } from "../src/upload/renameprogress";
import { clearRenameFeedback } from "../src/upload/renamefeedback";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import { sha256HexText } from "../src/lib/upload/hash";
import * as exporter from "../src/svgBuilder/exporter";
import * as raster from "../src/lib/upload/raster";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const savedHandles = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (k: string, v: unknown) => { savedHandles.set(k, v); }),
    loadHandles: vi.fn(async (k: string) => savedHandles.get(k) ?? null),
  };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="#111111" stroke-width="2"/></svg>';

function workspaceDir(): BinDir {
  const root = new BinDir("workspace");
  const cafe = new BinDir("cafe");
  root.children.set("cafe", cafe);
  for (const stem of ["coffee", "donut", "mug", "boba"]) {
    const sub = new BinDir(stem);
    cafe.children.set(stem, sub);
    const relDir = `cafe/${stem}`;
    const id = pairFile(relDir, `${stem}_AI.png`).id;
    const meta = serializePairMeta(pairFile(relDir, `${stem}_AI.png`, {
      id,
      versions: [svgVersion(`${relDir}/${stem}_AI.svg`, { version: 1, review: "approved" })],
    }));
    sub.children.set(`${stem}_AI.png`, new BinFile(`${stem}_AI.png`, "ai", 3100));
    sub.children.set(`${stem}_AI.svg`, new BinFile(`${stem}_AI.svg`, SVG, 3400));
    sub.children.set(`${stem}_AI.svg.json`, new BinFile(`${stem}_AI.svg.json`, meta, 3500));
  }
  return root;
}

let host: HTMLDivElement;
let dir: BinDir;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";

async function click(id: string): Promise<void> {
  await waitUntil(() => q(id) !== null, `element ${id}`);
  const el = q(id)!;
  const folded = el.closest("details:not([open])");
  if (folded) await act(async () => { (folded.querySelector("summary") as HTMLElement).click(); });
  await waitUntil(() => (el as HTMLButtonElement).disabled !== true, `${id} enabled`);
  await act(async () => { el.click(); });
  await settle(0);
}

async function typeInto(id: string, value: string): Promise<void> {
  await waitUntil(() => q(id) !== null, `input ${id}`);
  const el = q(id) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(0);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  savedHandles.clear();
  clearUploadNamesInMemory();
  resetAllRenameProgress();
  clearRenameFeedback();
  resetAppStore();
  dir = workspaceDir();
  (window as unknown as { showDirectoryPicker: () => Promise<BinDir> }).showDirectoryPicker = async () => dir;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  setIndexRuntime(null);
  vi.restoreAllMocks();
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

describe("Rename exported upload files across SVG builder, SVG to upload, and Upload", () => {
  it("SVG builder + Upload: renames artboards BEFORE first export, exports under uploadName, then bulk-renames from Title + Description on disk while preserving workName + id", async () => {
    saveBuilderFormats({ ...loadBuilderFormats(), includeSvg: true, includeJpeg: true, includeEps: false, expandText: false });
    vi.spyOn(exporter, "sheetPngBlob").mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    await click("tab-svg-builder");
    await click("builder-open-folder");
    await waitUntil(() => text("builder-library-count") === "4", "library scanned");
    await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
    await click("builder-template-save");
    await waitUntil(() => host.querySelector('[data-testid^="builder-template-add-artboard-"]') !== null, "template saved");
    const addBtn = host.querySelector('[data-testid^="builder-template-add-artboard-"]') as HTMLElement;
    await click(addBtn.getAttribute("data-testid")!);

    await waitUntil(() => host.querySelector('[data-testid^="builder-artboard-art-"]') !== null, "artboard added");
    const row = host.querySelector('[data-testid^="builder-artboard-art-"]') as HTMLElement;
    const abId = row.getAttribute("data-testid")!.replace("builder-artboard-", "");
    const originalRowName = (q(`builder-artboard-name-${abId}`) as HTMLInputElement).value;

    // Activate row: Metadata panel must NOT contain Upload file name!
    await click(`builder-artboard-${abId}`);
    expect(q(`builder-artboard-meta-fields-${abId}`)?.querySelector('[data-testid^="upload-name-box-"]')).toBeNull();
    expect(q("builder-meta-fields")?.querySelector('[data-testid^="upload-name-box-"]')).toBeNull();

    // Open dedicated per-row File name panel (`builder-artboard-rename-btn-${abId}`) and apply BEFORE exporting:
    await click(`builder-artboard-rename-btn-${abId}`);
    expect(q(`builder-artboard-rename-panel-${abId}`)).not.toBeNull();
    await click(`builder-artboard-check-${abId}`);
    await typeInto(`upload-file-name-${abId}`, "Set of assorted cafe food icons, fresh. Drinks machine cup");
    await click(`upload-name-apply-${abId}`);

    expect((q(`builder-artboard-name-${abId}`) as HTMLInputElement).value).toBe(originalRowName);
    expect(text(`builder-artboard-id-${abId}`)).toBe(abId);
    expect(text(`builder-artboard-upload-name-${abId}`)).toContain("Set_of_assorted_cafe_food_icons_fresh_Drinks_machine_cup");

    // First export writes under the pre-saved uploadName!
    await click("builder-export-selected");
    await waitUntil(() => /exported/i.test(text("builder-toast")), "artboard exported");

    // Switch to Upload tab: discovers the exported package with uploadName as stem and original workName preserved!
    await click("tab-stock-upload");
    await click("stock-pick-root-btn");
    await waitUntil(() => q(`stock-row-${abId}`) !== null, "stock row discovered");
    expect(text(`stock-name-${abId}`)).toBe("Set_of_assorted_cafe_food_icons_fresh_Drinks_machine_cup");
    expect(text(`stock-work-name-${abId}`)).toMatch(/_v1$/);

    // Enter Title + Description in Stock Upload (Metadata panel must NOT contain Upload file name!)
    // and click bulk "Rename for upload" to rename export/ files in-place!
    await click(`stock-row-${abId}`);
    expect(q(`stock-meta-fields-${abId}`)?.querySelector('[data-testid^="upload-name-box-"]')).toBeNull();
    await click(`stock-rename-btn-${abId}`);
    expect(q(`stock-rename-panel-${abId}`)).not.toBeNull();
    await typeInto(`stock-meta-title-${abId}`, "Set of assorted cafe food icons");
    await typeInto(`stock-meta-description-${abId}`, "Providing refreshing culinary enjoyment for customers. Drinks machine cup mug boba donut sandwich");
    await click(`stock-check-${abId}`);
    await click("stock-rename-selected");

    const expected = "Set_of_assorted_cafe_food_icons_Providing_refreshing_culinary_enjoyment_for_customers_Drinks_machine_cup_mug_boba_donut_sandwich";
    await waitUntil(() => text(`stock-name-${abId}`) === expected, "stock row renamed on disk");
    expect(text(`stock-work-name-${abId}`)).toMatch(/_v1$/);

    // Also verify SVG builder's bulk button (`builder-artboards-rename`) is present & wired:
    await click("tab-svg-builder");
    expect(q("builder-artboards-rename")).not.toBeNull();
  }, 20_000);

  it("SVG builder bulk Rename for upload: renames exported artboards from Title + Description (or reports real disk error, never false 'no metadata')", async () => {
    saveBuilderFormats({ ...loadBuilderFormats(), includeSvg: true, includeJpeg: true, includeEps: false, expandText: false });
    vi.spyOn(exporter, "sheetPngBlob").mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    await click("tab-svg-builder");
    await click("builder-open-folder");
    await waitUntil(() => text("builder-library-count") === "4", "library scanned");
    await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
    await click("builder-template-save");
    await waitUntil(() => host.querySelector('[data-testid^="builder-template-add-artboard-"]') !== null, "template saved");
    const addBtn = host.querySelector('[data-testid^="builder-template-add-artboard-"]') as HTMLElement;
    await click(addBtn.getAttribute("data-testid")!);

    await waitUntil(() => host.querySelector('[data-testid^="builder-artboard-art-"]') !== null, "artboard added");
    const row = host.querySelector('[data-testid^="builder-artboard-art-"]') as HTMLElement;
    const abId = row.getAttribute("data-testid")!.replace("builder-artboard-", "");

    // Export artboard first, then populate Title + Description in Stock Upload / artboard metadata:
    await click(`builder-artboard-check-${abId}`);
    await click("builder-export-selected");
    await waitUntil(() => /exported/i.test(text("builder-toast")), "artboard exported");

    // Put accepted metadata in export.json on disk (simulating an exported artboard whose disk metadata exists
    // OR whose metadata is set), then make disk read-only and click builder-artboards-rename:
    await click("tab-stock-upload");
    await click("stock-pick-root-btn");
    await waitUntil(() => q(`stock-row-${abId}`) !== null, "stock row discovered");
    await click(`stock-row-${abId}`);
    await typeInto(`stock-meta-title-${abId}`, "Breakfast meal and morning food icons");
    await typeInto(`stock-meta-description-${abId}`, "Enjoying a peaceful morning breakfast ritual. Toaster pan egg pancake cup icons");
    await typeInto(`stock-meta-tags-${abId}`, "icon, pictogram, vector, stroke, line, editable, web, breakfast, morning, food, toaster, pancake");
    await click(`stock-meta-accept-${abId}`);
    await waitUntil(() => /accepted|embedded/i.test(text("stock-toast")), "metadata embedded into export.json");

    // Return to SVG builder and click `builder-artboards-rename` on the checked exported artboard:
    // Even if `artboard.metadata` in memory wasn't populated yet, it reads Title + Description from disk / artboard and renames!
    await click("tab-svg-builder");
    if (!(q(`builder-artboard-check-${abId}`) as HTMLInputElement).checked) {
      await click(`builder-artboard-check-${abId}`);
    }
    await click("builder-artboards-rename");
    const expected = "Breakfast_meal_and_morning_food_icons_Enjoying_a_peaceful_morning_breakfast_ritual_Toaster_pan_egg_pancake_cup_icons";
    await waitUntil(() => /renamed/i.test(text("builder-toast")), "bulk artboard rename succeeded");
    expect(text("builder-toast")).not.toContain("No selected artboards have Title + Description");
    expect(text(`builder-artboard-upload-name-${abId}`)).toContain(expected);

    // Reset back to workName first via dedicated File name button, then break writes inside `export/` while keeping reads working:
    await click(`builder-artboard-rename-btn-${abId}`);
    await click(`upload-name-reset-${abId}`);
    await waitUntil(() => q(`builder-artboard-upload-name-${abId}`) === null, "reset to work name");
    const sheetsDir = dir.children.get("_artboard_sheets") as BinDir;
    const findExportDir = (d: BinDir): BinDir | null => {
      for (const [k, child] of d.children) {
        if (child.kind !== "directory") continue;
        if (k === "export") return child as BinDir;
        const hit = findExportDir(child as BinDir);
        if (hit) return hit;
      }
      return null;
    };
    const expDir = findExportDir(sheetsDir)!;
    const origGetFile = expDir.getFileHandle.bind(expDir);
    expDir.getFileHandle = async (name: string, opts?: { create?: boolean }) => {
      if (opts?.create) throw new Error("Access denied by OS");
      return origGetFile(name, opts);
    };
    await click("builder-artboards-rename");
    await waitUntil(() => /Access denied by OS/i.test(text("builder-toast")), "real disk error shown");
    expect(text("builder-toast")).toContain("Could not rename exported files");
    expect(text("builder-toast")).not.toContain("No selected artboards have Title + Description");
    // And UI uploadName was NOT prematurely overwritten with the failed target!
    expect(q(`builder-artboard-upload-name-${abId}`)).toBeNull();
  }, 20_000);

  it("SVG to upload: bulk-renames selected icons from Title + Description before export, exports under uploadName, then renames existing export/ files on disk", async () => {
    const cur = loadUploadSettings();
    saveUploadSettings({ ...cur, defaults: { ...cur.defaults, includeSvg: true, includeJpeg: false, includeEps: true, epsConverter: "builtin", expandText: false } });
    vi.spyOn(raster, "rasterizeJpeg").mockImplementation(async () => { throw new Error("jpeg off"); });

    const coffeeId = pairFile("cafe/coffee", "coffee_AI.png").id;
    rememberMeta(`sha256:${await sha256HexText(SVG)}`, {
      state: "accepted",
      meta: {
        title: "Set of assorted cafe food icons",
        description: "Providing refreshing culinary enjoyment for customers with drinks machine cup mug boba donut sandwich",
        tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "coffee", "cafe", "cup"],
        name: "coffee",
      },
    });

    await click("tab-upload");
    await click("upload-open-folder-empty");
    await waitUntil(() => host.querySelectorAll('[data-testid^="upload-row-pair_"]').length === 4, "upload rows loaded");
    await waitUntil(() => q("upload-busy") === null, "source hashes and metadata restored");

    // Working svgName is coffee_AI.svg:
    expect(q(`upload-row-${coffeeId}`)?.textContent).toContain("coffee_AI.svg");

    // Check coffee and click bulk "Rename for upload" BEFORE exporting:
    await click(`upload-check-${coffeeId}`);
    await click("upload-rename-selected");
    const expectedBulk = "Set_of_assorted_cafe_food_icons_Providing_refreshing_culinary_enjoyment_for_customers_with_drinks_machine_cup_mug_boba_donut_sandwich";
    await waitUntil(() => text(`upload-export-name-${coffeeId}`).includes(expectedBulk), "upload name shown on row");
    // Working svgName stays unchanged:
    expect(q(`upload-row-${coffeeId}`)?.textContent).toContain("coffee_AI.svg");

    // First export writes under expectedBulk.svg!
    await click("upload-export-selected");
    await waitUntil(() => /processed/i.test(text(`upload-status-${coffeeId}`)), "icon exported");

    const coffeeDir = (dir.children.get("cafe") as BinDir).children.get("coffee") as BinDir;
    const exportDir = coffeeDir.children.get("export") as BinDir;
    expect(exportDir.children.has(`${expectedBulk}.svg`)).toBe(true);
    expect(exportDir.children.has(`${expectedBulk}.eps`)).toBe(true);
    expect(exportDir.children.has("coffee_AI.svg")).toBe(false);
    // Exported SVG & EPS metadata/headers must NEVER contain uploadName:
    expect((exportDir.children.get(`${expectedBulk}.svg`) as BinFile).text).not.toContain(expectedBulk);
    expect((exportDir.children.get(`${expectedBulk}.eps`) as BinFile).text).not.toContain(expectedBulk);

    // Activate row: Metadata panel must NOT contain Upload file name!
    await click(`upload-row-${coffeeId}`);
    expect(q(`upload-meta-fields-${coffeeId}`)?.querySelector('[data-testid^="upload-name-box-"]')).toBeNull();

    // Open dedicated File name panel (`upload-rename-btn-${coffeeId}`) -> renames export/ on disk immediately!
    await click(`upload-rename-btn-${coffeeId}`);
    expect(q(`upload-rename-panel-${coffeeId}`)).not.toBeNull();
    await typeInto(`upload-file-name-${coffeeId}`, "Hot morning coffee cup icon, minimalist line.");
    await click(`upload-name-apply-${coffeeId}`);

    await waitUntil(() => exportDir.children.has("Hot_morning_coffee_cup_icon_minimalist_line.svg"), "disk file renamed");
    expect(exportDir.children.has("Hot_morning_coffee_cup_icon_minimalist_line.eps")).toBe(true);
    expect(exportDir.children.has(`${expectedBulk}.svg`)).toBe(false);
    const savedRec = JSON.parse((exportDir.children.get("export.json") as BinFile).text);
    expect(savedRec.workName).toBe("coffee");
    expect(savedRec.uploadName).toBe("Hot_morning_coffee_cup_icon_minimalist_line");
    expect(JSON.stringify(savedRec.metadata)).not.toContain("Hot_morning_coffee_cup_icon_minimalist_line");
    expect(savedRec.uploadName).toBe("Hot_morning_coffee_cup_icon_minimalist_line");

    // Reset back to workName -> renames disk file back to coffee.svg, then per-item "From Title + Description":
    await click(`upload-name-reset-${coffeeId}`);
    await waitUntil(() => exportDir.children.has("coffee.svg"), "disk file reset to workName");
    await click(`upload-name-from-meta-${coffeeId}`);
    await waitUntil(() => exportDir.children.has(`${expectedBulk}.svg`), "disk file rebuilt from meta");
  }, 20_000);

  it("shows live ProcessProgressBar with persistent result summary on bulk rename AND always responds on single-item rename even when the name is already the same across all 3 tabs", async () => {
    saveBuilderFormats({ ...loadBuilderFormats(), includeSvg: true, includeJpeg: false, includeEps: false, expandText: false });
    const cur = loadUploadSettings();
    saveUploadSettings({ ...cur, defaults: { ...cur.defaults, includeSvg: true, includeJpeg: false, includeEps: false, expandText: false } });
    vi.spyOn(exporter, "sheetPngBlob").mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    const coffeeId = pairFile("cafe/coffee", "coffee_AI.png").id;
    const donutId = pairFile("cafe/donut", "donut_AI.png").id;
    const mugId = pairFile("cafe/mug", "mug_AI.png").id;
    rememberMeta(`sha256:${await sha256HexText(SVG)}`, {
      state: "accepted",
      meta: {
        title: "Set of assorted cafe food icons",
        description: "Providing refreshing culinary enjoyment for customers",
        tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "coffee", "cafe", "cup"],
        name: "coffee",
      },
    });

    // 1. SVG to upload: bulk rename across multiple items shows ProcessProgressBar + persistent result summary!
    await click("tab-upload");
    await click("upload-open-folder-empty");
    await waitUntil(() => host.querySelectorAll('[data-testid^="upload-row-pair_"]').length === 4, "upload rows loaded");
    await waitUntil(() => q("upload-busy") === null, "upload hashes settled");

    await click(`upload-check-${coffeeId}`);
    await click(`upload-check-${donutId}`);
    await click(`upload-check-${mugId}`);

    // Clicking bulk rename immediately shows the LIVE running ProcessProgressBar with Cancel before the batch finishes:
    act(() => { q("upload-rename-selected")!.click(); });
    expect(q("upload-rename-progress-header")?.getAttribute("data-status")).toBe("running");
    expect(q("upload-rename-progress-cancel")).not.toBeNull();
    expect(text("upload-rename-progress-remaining")).toBe("3 remaining");
    act(() => { q("upload-rename-progress-cancel")!.click(); });
    await waitUntil(() => q("upload-rename-progress-header")?.getAttribute("data-status") === "cancelled", "upload rename cancelled");

    // Re-run bulk rename to completion:
    await click("upload-rename-selected");

    await waitUntil(() => q("upload-rename-progress-header")?.getAttribute("data-status") === "completed", "upload rename progress completed");
    expect(text("upload-rename-progress-completed")).toBe("3 completed / 3");
    expect(text("upload-rename-progress-remaining")).toBe("0 remaining");
    expect(text("upload-rename-progress-file")).toContain("3 renamed");
    // Stays visible until dismissed, and re-running bulk rename when all 3 ALREADY have that exact name reports 'already had same name':
    await click("upload-rename-selected");
    await waitUntil(
      () => q("upload-rename-progress-header")?.getAttribute("data-status") === "completed"
        && /already had same/i.test(text("upload-rename-progress-file")),
      "bulk rename reports unchanged items explicitly",
    );
    expect(text("upload-toast")).toMatch(/already had same/i);
    await click("upload-rename-progress-dismiss");
    expect(q("upload-rename-progress-header")).toBeNull();

    // Single-item rename in SVG to upload when item ALREADY has the exact same name:
    // Apply button is NOT disabled and responds visibly on EVERY click (seq increments + toast)!
    await click(`upload-rename-btn-${coffeeId}`);
    expect((q(`upload-name-apply-${coffeeId}`) as HTMLButtonElement).disabled).toBe(false);
    await click(`upload-name-apply-${coffeeId}`);
    await waitUntil(() => q(`upload-name-status-${coffeeId}`) !== null, "inline feedback on first same-name click");
    expect(text(`upload-name-status-${coffeeId}`)).toMatch(/already/i);
    expect(text("upload-toast")).toMatch(/already/i);
    const seq1 = q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq");

    // Clicking Apply AGAIN with the exact same name STILL responds visibly (seq increments!):
    await click(`upload-name-apply-${coffeeId}`);
    await waitUntil(() => q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq") !== seq1, "seq incremented on repeat click");
    const seq2 = q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq");

    // Clicking '✦ From Title + Description' when it ALREADY has that generated name STILL responds visibly:
    await click(`upload-name-from-meta-${coffeeId}`);
    await waitUntil(() => q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq") !== seq2, "seq incremented on From Title + Description");

    // Pressing Enter in the input when the name is STILL the exact same name also responds visibly:
    const seq3 = q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq");
    await act(async () => {
      q(`upload-file-name-${coffeeId}`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await waitUntil(() => q(`upload-name-status-${coffeeId}`)?.getAttribute("data-seq") !== seq3, "seq incremented on Enter key");

    // Export coffee, then test Stock Upload + SVG builder progress bars & same-name single-item feedback:
    await click("upload-export-selected");
    await waitUntil(() => /processed/i.test(text(`upload-status-${coffeeId}`)), "exported for stock");

    // 2. Stock Upload (`tab-stock-upload`): bulk progress bar + single-item same-name response!
    await click("tab-stock-upload");
    if (q("stock-pick-root-btn") !== null) await click("stock-pick-root-btn");
    await waitUntil(() => q(`stock-row-${coffeeId}`) !== null, "stock row loaded");
    await click(`stock-check-${coffeeId}`);
    await click("stock-rename-selected");
    await waitUntil(() => q("stock-rename-progress-header")?.getAttribute("data-status") === "completed", "stock rename progress completed");
    expect(text("stock-rename-progress-file")).toMatch(/already had same/i);
    await click("stock-rename-progress-dismiss");
    expect(q("stock-rename-progress-header")).toBeNull();

    await click(`stock-rename-btn-${coffeeId}`);
    expect((q(`stock-rename-panel-${coffeeId}`)!.querySelector(`[data-testid="upload-name-apply-${coffeeId}"]`) as HTMLButtonElement).disabled).toBe(false);
    await click(`upload-name-apply-${coffeeId}`);
    await waitUntil(() => /already/i.test(text(`upload-name-status-${coffeeId}`)), "stock single-item same-name response");
    expect(text("stock-toast")).toMatch(/already/i);

    // 3. SVG builder (`tab-svg-builder`): bulk progress bar + single-item same-name response (including Reset when already at workName)!
    await click("tab-svg-builder");
    await click("builder-open-folder");
    await waitUntil(() => text("builder-library-count") === "4", "builder library scanned");
    await waitUntil(() => q("builder-artboard") !== null, "builder sheet composed");
    await click("builder-template-save");
    await waitUntil(() => host.querySelector('[data-testid^="builder-template-add-artboard-"]') !== null, "builder template saved");
    const addBtn = host.querySelector('[data-testid^="builder-template-add-artboard-"]') as HTMLElement;
    await click(addBtn.getAttribute("data-testid")!);
    await waitUntil(() => host.querySelector('[data-testid^="builder-artboard-art-"]') !== null, "builder artboard added");
    const abId = (host.querySelector('[data-testid^="builder-artboard-art-"]') as HTMLElement)
      .getAttribute("data-testid")!
      .replace("builder-artboard-", "");

    // Single-item Reset when ALREADY at workName responds explicitly!
    await click(`builder-artboard-rename-btn-${abId}`);
    expect((q(`upload-name-reset-${abId}`) as HTMLButtonElement).disabled).toBe(false);
    await click(`upload-name-reset-${abId}`);
    await waitUntil(() => /already using work name/i.test(text(`upload-name-status-${abId}`)), "reset when already at workName responds");
    expect(text("builder-toast")).toMatch(/already using work name/i);

    // Bulk rename on artboard without metadata shows ProcessProgressBar with failed/skipped result summary!
    await click(`builder-artboard-check-${abId}`);
    await click("builder-artboards-rename");
    await waitUntil(() => q("builder-rename-progress-header")?.getAttribute("data-status") === "failed", "builder rename progress shows missing-meta result");
    expect(text("builder-rename-progress-file")).toMatch(/skipped|no.*metadata/i);
    await click("builder-rename-progress-dismiss");
    expect(q("builder-rename-progress-header")).toBeNull();
  }, 25_000);
});

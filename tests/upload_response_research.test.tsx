// Research fixture: FULL UploadPanel, real hooks/scan/rules; filesystem and
// unavailable transport are the only boundaries. Times are Happy DOM diagnostics,
// not browser frame latency and not performance gates.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import UploadPanel from "../src/upload/UploadPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { clearKnownRoots } from "../src/lib/knownroots";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { localSettingsSnapshot } from "../src/lib/upload/settingslocal";
import * as storage from "../src/state/safestorage";
import * as settingsStore from "../src/upload/settingsstore";
import * as decorations from "../src/lib/upload/decorations";
import * as download from "../src/upload/downloadactions";
import * as rowmodel from "../src/upload/rowmodel";
import * as prepare from "../src/lib/upload/prepare";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { commitPackage, PACKAGE_SVG } from "./helpers/uploadpackage";
import { waitUntil } from "./helpers/quiet";

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (original) => ({
  ...await original<typeof import("../src/batch/store")>(),
  loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
}));
let host: HTMLDivElement, root: Root;
const reports: unknown[] = [];

beforeEach(() => {
  localStorage.clear(); stored.clear(); resetAppStore(); clearKnownRoots();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network in research fixture"); }));
  Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => null });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); resetAppStore();
  if (process.env.UPLOAD_RESPONSE_REPORT) {
    mkdirSync(dirname(process.env.UPLOAD_RESPONSE_REPORT), { recursive: true });
    writeFileSync(process.env.UPLOAD_RESPONSE_REPORT, JSON.stringify(reports, null, 2));
  }
});

function fixture(count: number, pinned: boolean | "snapshot") {
  const dir = new BinDir("upload-response");
  const overrides: Record<string, object> = {};
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const path = `pack-${String(i).padStart(4, "0")}`;
    const sub = new BinDir(path); dir.children.set(path, sub);
    const id = pairId(path, "icon", ""); ids.push(id);
    sub.children.set("icon_AI.png", new BinFile("icon_AI.png", "fixture", 1000));
    sub.children.set("icon_AI.svg", new BinFile("icon_AI.svg", PACKAGE_SVG, 1100));
    const meta = pairFile(path, "icon_AI.png", { id, versions: [svgVersion(`${path}/icon_AI.svg`, { review: "approved" })] });
    sub.children.set("icon_AI.svg.json", new BinFile("icon_AI.svg.json", serializePairMeta(meta), 1200));
    commitPackage({ dir: sub, dirPath: path, name: "icon", kinds: ["svg", "jpg", "eps"] });
    if (pinned) overrides[id] = pinned === "snapshot"
      ? localSettingsSnapshot({ ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS }, { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS })
      : { strokePx: 0, paddingPct: null, background: AS_IS_SETTINGS.background };
  }
  settingsStore.saveUploadSettings({ defaults: { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS }, overrides, applied: {} });
  stored.set("__upload__", { source: dir });
  return ids;
}

const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const click = async (id: string) => act(async () => q(id).click());

describe("Upload full-panel response research", () => {
  it.each([{ count: 100, pinned: false }, { count: 1000, pinned: false }, { count: 1000, pinned: true }, { count: 1000, pinned: "snapshot" as const }])(
    "profiles real warm gestures for $count rows, stored pins=$pinned", async ({ count, pinned }) => {
      const ids = fixture(count, pinned);
      const storedBytes = localStorage.getItem("iconSplitter.upload.settings.v1")!.length;
      await act(async () => root.render(<HistoryProvider><UploadPanel /></HistoryProvider>));
      await waitUntil(() => q("upload-row-count")?.textContent === String(count), "all real rows assembled", 30000);
      // Let local text reads/AS-IS preview effects settle before profiling gestures.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 160)); });
      expect(host.querySelectorAll("[data-testid^=upload-row-][role=listitem]")).toHaveLength(count);
      const originalLoad = settingsStore.loadUploadSettings;
      let bootLoadMs = 0;
      const loads = vi.spyOn(settingsStore, "loadUploadSettings").mockImplementation(() => {
        const start = performance.now(); const value = originalLoad();
        bootLoadMs += performance.now() - start; return value;
      });
      const effective = vi.spyOn(decorations, "rowSettings");
      const plans = vi.spyOn(download, "downloadPlanOf");
      const needed = vi.spyOn(rowmodel, "idsNeedingMetadata");
      const previews = vi.spyOn(prepare, "prepareExportSvg");
      const reads = vi.spyOn(storage, "readKey");
      const samples: unknown[] = [];
      const measure = async (gesture: string, action: () => Promise<unknown>) => {
        for (const spy of [loads, effective, plans, needed, previews, reads]) spy.mockClear();
        bootLoadMs = 0;
        const start = performance.now(); await action(); const ms = performance.now() - start;
        samples.push({ gesture, actMs: +ms.toFixed(3), bootSettingsLoads: loads.mock.calls.length, bootLoadMs: +bootLoadMs.toFixed(3),
          effectiveSettingsCalls: effective.mock.calls.length, downloadPlans: plans.mock.calls.length,
          metadataScans: needed.mock.calls.length, previewPrepares: previews.mock.calls.length,
          storageReads: reads.mock.calls.length });
      };
      await measure("activate-first", () => click(`upload-row-${ids[0]}`));
      expect(getAppState().upload.activeId).toBe(ids[0]);
      await measure("activate-next", () => click(`upload-row-${ids[1]}`));
      expect(getAppState().upload.checked).toEqual([]);
      await measure("check-one", () => click(`upload-check-${ids[0]}`));
      expect(getAppState().upload.checked).toEqual([ids[0]]);
      await measure("select-visible", () => click("upload-select-visible"));
      expect(getAppState().upload.checked).toHaveLength(count);
      await measure("active-with-all-checked", () => click(`upload-row-${ids[2]}`));
      await measure("open-export-settings", () => click("upload-settings-open"));
      expect(q("upload-dialog-backdrop")).toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
      reports.push({ count, pinned, storedBytes, samples });
    }, 60000,
  );
});

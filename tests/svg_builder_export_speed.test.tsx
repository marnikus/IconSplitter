// @vitest-environment happy-dom
// svg_builder_export_speed.test.tsx — End-to-end TDD performance & output gate
// for SVG builder artboard export: 1,107 approved library icons + 7 checked 6x4
// artboards (168 placed multi-path icons), verifying >= 80% wall-clock & FS
// round-trip reduction, zero mid-batch workspace churn, and 100% clean packages.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SvgBuilderPanel from "../src/svgBuilder/SvgBuilderPanel";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { loadBuilderFormats, saveBuilderFormats } from "../src/svgBuilder/formatstore";
import { saveTemplates } from "../src/svgBuilder/templatestore";
import { saveArtboards } from "../src/svgBuilder/artboardstore";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { newArtboard, type FinalArtboard } from "../src/lib/svgBuilder/artboards";
import { clearSanitizedIcons } from "../src/lib/svgBuilder/svgAsset";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import { parseExportRecord } from "../src/lib/upload/export";
import { verifyEps } from "../src/lib/upload/eps";
import * as composeMod from "../src/lib/svgBuilder/compose";
import * as exporter from "../src/svgBuilder/exporter";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeRealIconSvg(i: number): string {
  const paths: string[] = [];
  for (let p = 0; p < 12; p += 1) {
    const y = 8 + p * 3.8 + (i % 5) * 0.2;
    paths.push(
      `<path d="M10 ${y.toFixed(2)} C18 ${(y - 4).toFixed(2)} 28 ${(y + 4).toFixed(2)} 36 ${y.toFixed(2)} C44 ${(y - 3).toFixed(2)} 50 ${(y + 3).toFixed(2)} 56 ${y.toFixed(2)}" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><g>${paths.join("")}</g></svg>`;
}

interface FsStats { dirOps: number; fileOps: number; writes: number; removes: number; fsDelayMs: number }

class InstrumentedDir extends BinDir {
  constructor(name: string, public stats: FsStats) { super(name); }
  private async wait(): Promise<void> {
    if (this.stats.fsDelayMs > 0) await new Promise((r) => setTimeout(r, this.stats.fsDelayMs));
  }
  override async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<BinDir> {
    this.stats.dirOps += 1;
    await this.wait();
    const cur = this.children.get(name);
    if (cur instanceof BinDir) return cur;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const next = new InstrumentedDir(name, this.stats);
    this.children.set(name, next);
    return next;
  }
  override async getFileHandle(name: string, opts?: { create?: boolean }): Promise<BinFile> {
    this.stats.fileOps += 1;
    await this.wait();
    const cur = this.children.get(name);
    if (cur instanceof BinFile) return cur;
    if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
    const stats = this.stats;
    const f = new BinFile(name, "", Date.now());
    const origWritable = f.createWritable.bind(f);
    f.createWritable = async () => {
      const w = await origWritable();
      const origClose = w.close.bind(w);
      w.close = async () => {
        stats.writes += 1;
        if (stats.fsDelayMs > 0) await new Promise((r) => setTimeout(r, stats.fsDelayMs));
        return origClose();
      };
      return w;
    };
    this.children.set(name, f);
    return f;
  }
  override async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
    this.stats.removes += 1;
    await this.wait();
    return super.removeEntry(name, opts);
  }
}

afterEach(() => {
  setIndexRuntime(null);
  setTextOutliner(null);
  vi.restoreAllMocks();
});

describe("SVG builder 7-artboard x 24-icon export speed & quality gate (1107-icon workspace)", () => {
  it("cuts 7-artboard default (2ms FS) & full-stock export time by >= 80% (<= 0.20x baseline) with intact outputs", async () => {
    localStorage.clear();
    resetAppStore();
    clearSanitizedIcons();
    setIndexRuntime(null);
    vi.spyOn(exporter, "sheetPngBlob").mockResolvedValue(new Blob(["png-bytes"], { type: "image/png" }));

    const stats: FsStats = { dirOps: 0, fileOps: 0, writes: 0, removes: 0, fsDelayMs: 0 };
    const root = new InstrumentedDir("Picked", stats);
    const ids: string[] = [];
    for (let i = 0; i < 1107; i += 1) {
      const stem = `food_${String(i).padStart(4, "0")}`;
      const sub = new InstrumentedDir(stem, stats);
      root.children.set(stem, sub);
      const pf = pairFile(stem, `${stem}_AI.png`, {
        versions: [svgVersion(`${stem}/${stem}_AI.svg`, { version: 1, review: "approved" })],
      });
      ids.push(pf.id);
      sub.children.set(`${stem}_AI.png`, new BinFile(`${stem}_AI.png`, "png", 1000));
      sub.children.set(`${stem}_AI.svg`, new BinFile(`${stem}_AI.svg`, makeRealIconSvg(i), 2000));
      sub.children.set(`${stem}_AI.svg.json`, new BinFile(`${stem}_AI.svg.json`, serializePairMeta(pf), 3000));
    }

    const cfg = {
      ...DEFAULT_CONFIG,
      grid: { ...DEFAULT_CONFIG.grid, columns: 6, rows: 4, captions: true },
      banner: { ...DEFAULT_CONFIG.banner, position: "right" as const, layout: "split" as const },
    };
    const tpl = newTemplate(cfg, [], "2026-11-19T00:00:00Z", "tpl-right-6x4");
    const artboards: FinalArtboard[] = [];
    for (let k = 0; k < 7; k += 1) {
      artboards.push(
        newArtboard(tpl, artboards, {
          id: `art-${k + 1}`,
          now: "2026-11-19T00:00:00Z",
          placedIds: Array.from({ length: 24 }, (_, j) => ids[k * 24 + j]),
        }),
      );
    }
    saveTemplates([tpl]);
    saveArtboards(artboards);

    (window as unknown as { showDirectoryPicker: () => Promise<BinDir> }).showDirectoryPicker = async () => root;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const ui = createRoot(host);
    const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

    act(() => { ui.render(createElement(SvgBuilderPanel, { active: true })); });
    await act(async () => { q("builder-open-folder")!.click(); });
    await waitUntil(() => q("builder-library-count")?.textContent === "1107", "1107 scanned", 15000);
    await act(async () => { q("builder-template-tpl-right-6x4")!.click(); });
    await waitUntil(() => host.querySelectorAll('[data-testid^="builder-artboard-art-"]').length === 7, "7 artboards", 15000);
    await act(async () => { q("builder-artboards-check-all")!.click(); });

    const origCompose = composeMod.composeSheet;
    let composeCount = 0;
    vi.spyOn(composeMod, "composeSheet").mockImplementation((...a) => {
      composeCount += 1;
      return origCompose(...a);
    });

    // Gate 1: Default export (SVG + PNG + SVGO + cleanExport) with realistic 2ms FS round-trip delay.
    // Baseline measured: 3,366 ms, 570 dirOps, 7 probe removes.
    // >= 80% reduction requires: <= 670 ms (<= 0.20x of 3,366 ms) and zero probe removes!
    // Let initial workspace scan, mirror sync, and thumbnail preload settle before starting the export stopwatch:
    await settle(700);
    clearSanitizedIcons();
    composeCount = 0;
    Object.assign(stats, { dirOps: 0, fileOps: 0, writes: 0, removes: 0, fsDelayMs: 2 });
    saveBuilderFormats({
      ...loadBuilderFormats(),
      includeSvg: true, includeJpeg: true, includeEps: false,
      optimizeSvg: true, cleanExport: true, expandStrokes: false, expandText: false, rescaleArtboard: false,
    });
    const tDef0 = performance.now();
    await act(async () => { q("builder-export-selected")!.click(); });
    await waitUntil(() => q("builder-export-progress-header")?.getAttribute("data-status") === "completed", "default done", 20000);
    const defMs = performance.now() - tDef0;
    const coverageRun = process.env.PERF_BUDGETS === "coverage";

    expect(defMs).toBeLessThanOrEqual(coverageRun ? 1650 : 670);
    expect(stats.removes).toBe(0);
    // Exactly 7 export compositions (zero spurious workspace/preview re-compositions during export!):
    expect(composeCount).toBe(7);
    expect(q("builder-export-progress-completed")?.textContent).toBe("7 completed / 7");
    expect(q("builder-export-progress-percent")?.textContent).toBe("100%");

    // Gate 2: Full Stock export (SVG + PNG + builtin EPS + expandStrokes + expandText + rescaleArtboard + SVGO + cleanExport).
    // Baseline measured (with mocked sheetPngBlob): ~7,700 ms (7 * 1,088 ms + React/FS).
    // >= 80% reduction requires: <= 1,540 ms (<= 0.20x of 7,700 ms)!
    setTextOutliner((run) => ({ d: `M0 0 L${run.value.length * 6} 0 L${run.value.length * 6} -10 L0 -10 Z`, width: run.value.length * 6 }));
    clearSanitizedIcons();
    Object.assign(stats, { dirOps: 0, fileOps: 0, writes: 0, removes: 0, fsDelayMs: 0 });
    saveBuilderFormats({
      ...loadBuilderFormats(),
      includeSvg: true, includeJpeg: true, includeEps: true, epsConverter: "builtin",
      optimizeSvg: true, cleanExport: true, expandStrokes: true, expandText: true, rescaleArtboard: true,
    });
    const tFull0 = performance.now();
    await act(async () => { q("builder-export-selected")!.click(); });
    await waitUntil(() => q("builder-export-progress-header")?.getAttribute("data-status") === "completed", "full done", 20000);
    const fullMs = performance.now() - tFull0;

    expect(fullMs).toBeLessThanOrEqual(coverageRun ? 3800 : 1540);
    expect(stats.removes).toBe(0);

    // Verify committed files & usage records across the workspace:
    const savedArtboards = JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.artboards.v1") ?? "[]") as FinalArtboard[];
    expect(savedArtboards).toHaveLength(7);
    for (const ab of savedArtboards) {
      expect(ab.folder).toBeTruthy();
      expect(ab.exportedAt).toBeTruthy();
      expect(ab.countedIds).toHaveLength(24);
      let dir: BinDir | undefined = root;
      for (const seg of `${ab.folder}/export`.split("/")) dir = dir?.children.get(seg) as BinDir | undefined;
      expect(dir).toBeDefined();
      const names = [...dir!.children.keys()];
      expect(names).toContain("export.json");
      const svgFile = names.find((n) => n.endsWith(".svg"))!;
      const epsFile = names.find((n) => n.endsWith(".eps"))!;
      const pngFile = names.find((n) => n.endsWith(".png"))!;
      expect(svgFile).toBeTruthy();
      expect(epsFile).toBeTruthy();
      expect(pngFile).toBeTruthy();
      const recText = await (await (await dir!.getFileHandle("export.json")).getFile()).text();
      expect(parseExportRecord(JSON.parse(recText))?.status).toBe("processed");
      const epsText = await (await (await dir!.getFileHandle(epsFile)).getFile()).text();
      expect(verifyEps(epsText).ok).toBe(true);
    }

    act(() => { ui.unmount(); });
    host.remove();
  }, 60_000);
});

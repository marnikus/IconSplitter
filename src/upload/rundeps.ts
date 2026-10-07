// rundeps.ts — the browser's half of the export pipeline (RULE 10/13).
//
// The pipeline itself is pure and tested without a DOM (`lib/uploadpipeline`).
// Everything that needs a canvas, a File System handle or an optional host
// bridge is injected here, in ONE place, so a run and a test differ only in
// these four functions.

import { browserDeps, rasterize } from "../lib/uploadraster";
import { svgToEps } from "../lib/epssvg";
import { epsSummary, verifyEps } from "../lib/epsverify";
import { epsHostRenderer } from "./epsprobe";
import type { DirHandleLike } from "../lib/fs";
import type { PixelSize } from "../lib/uploadartboard";
import type { RunContext } from "./run";
import type { UploadSettings } from "../lib/uploadsettings";
import type { OverrideMap } from "../lib/uploadoverride";

/** The pieces of store state the browser half of the pipeline needs. */
export type RunState = { settings: UploadSettings; overrides: OverrideMap; provider: { concurrency: number } };

/** The pipeline is pure; this is the browser's half of it. */
function runContext(
  root: DirHandleLike,
  controller: AbortController,
  state: RunState,
  log: (line: string) => void,
): RunContext {
  return {
    root,
    settings: state.settings,
    overrides: state.overrides,
    wants: { svg: true, jpeg: true, eps: state.settings.includeEps },
    metadataOf: (row) => (row.metadataCheck?.ok === true ? row.metadata : null),
    ...renderers(state.settings),
    log: (entry) => log(`${entry.stage}: ${entry.message}`),
    signal: controller.signal,
    now: () => new Date().toISOString(),
    limit: state.provider.concurrency,
  };
}

/** Raster, vector-to-EPS and the EPS check: the three things a canvas owns. */
function renderers(settings: UploadSettings): Pick<RunContext, "raster" | "eps" | "verifyEps"> {
  return {
    raster: (svg, artboard) => renderJpeg(svg, artboard.px, settings),
    eps: (svg, artboard) => svgToEps({
      svg,
      widthPt: (artboard.px.width * 72) / settings.dpi,
      heightPt: (artboard.px.height * 72) / settings.dpi,
    }),
    verifyEps: async (file) => {
      const check = await verifyEps({
        eps: file.eps,
        expectedPt: { width: file.width, height: file.height },
        // Absent on a plain browser: the check then reports `unavailable`, it
        // never pretends the file draws (DESIGN §7, requirement 13).
        render: epsHostRenderer()?.render,
      });
      return { ok: check.ok, label: epsSummary(file, check), problems: check.checks.problems };
    },
  };
}

async function renderJpeg(svg: string, px: PixelSize, settings: RunState["settings"]) {
  const rendered = await rasterize({ svg, px, background: settings.background, quality: settings.jpegQuality }, browserDeps());
  const bytes = rendered.blob === null ? null : new Uint8Array(await rendered.blob.arrayBuffer());
  return { ok: rendered.ok, bytes, error: rendered.error, width: rendered.width, height: rendered.height };
}

export { runContext };

// BuilderExport.tsx — taking the sheet out of the app (design §5.5).
//
// The controls are deliberately few and explicit: a PNG size, and three actions
// that each name what they write. Nothing happens on a keystroke, and nothing is
// written into the user's folder without a click — the builder reads a folder it
// was pointed at, so writing into it is a change to the user's disk and gets a
// deliberate action.
//
// The commit goes to `builder/` only (builder/commit), is create-only, and the
// result is stated in the tab's one status line, with the names actually written.

import type { BuilderConfig } from "../lib/builder/defaults";
import type { PngScale } from "./exportrun";

export interface BuilderExportProps {
  config: BuilderConfig;
  /** Non-null while an export runs: its own words are the busy label. */
  busy: string | null;
  /** What the last export wrote, or why it did not. */
  last: string | null;
  /** A folder must be picked before anything can be committed. */
  canCommit: boolean;
  scale: PngScale;
  onScale: (scale: PngScale) => void;
  onDownloadSvg: () => void;
  onDownloadPng: () => void;
  onDownloadZip: () => void;
  onCommit: () => void;
}

export default function BuilderExport(p: BuilderExportProps) {
  return (
    <section className="bld-controls" data-testid="builder-export" aria-label="Export the sheet">
      <ScaleField config={p.config} scale={p.scale} onScale={p.onScale} />
      <Actions p={p} />
      <p className="bld-note" data-testid="builder-export-note">{noteOf(p.canCommit)}</p>
      {p.last !== null && <p className="bld-note" data-testid="builder-export-last" role="status">{p.last}</p>}
    </section>
  );
}

/** The PNG size, stated in the real pixels it will write. */
function ScaleField({ config, scale, onScale }: {
  config: BuilderConfig; scale: PngScale; onScale: (s: PngScale) => void;
}) {
  const a = config.artboard;
  return (
    <div className="bld-group" data-testid="builder-export-size">
      <h3 className="bld-group-title">Export</h3>
      <label className="bld-field">
        <span className="bld-label">PNG size</span>
        <select className="bld-input" data-testid="builder-png-scale" value={String(scale)}
          onChange={(e) => onScale(Number(e.target.value) as PngScale)}>
          {([1, 2, 3] as const).map((s) => (
            <option key={s} value={s}>{s}× — {a.width * s}×{a.height * s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** The four actions; the commit is the only one that touches the user's disk. */
function Actions({ p }: { p: BuilderExportProps }) {
  const busy = p.busy !== null;
  return (
    <div className="bld-export-actions">
      <button type="button" className="svg-btn" data-testid="builder-download-svg" disabled={busy} onClick={p.onDownloadSvg}>Download SVG</button>
      <button type="button" className="svg-btn" data-testid="builder-download-png" disabled={busy} onClick={p.onDownloadPng}>Download PNG</button>
      <button type="button" className="svg-btn" data-testid="builder-download-zip" disabled={busy} onClick={p.onDownloadZip}>Download ZIP</button>
      <button type="button" className="svg-btn" data-testid="builder-commit" disabled={busy || !p.canCommit} onClick={p.onCommit}>
        {p.busy ?? "Save to builder/"}
      </button>
    </div>
  );
}

/** Where the files go, or why they cannot go anywhere yet. */
function noteOf(canCommit: boolean): string {
  return canCommit
    ? "Saved files go into builder/ beside your icons; an existing file is never overwritten."
    : "Pick a folder first — the sheet is saved into builder/ inside it.";
}

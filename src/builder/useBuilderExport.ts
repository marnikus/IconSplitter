// useBuilderExport.ts — the export actions the panel wires to a click (design
// §5.5). Downloads are local (a Blob and the browser's own save), the commit goes
// through builder/exportrun into `builder/` only, and every outcome — including
// "nothing was placed" — is said in the tab's one status line.

import { useState } from "react";
import { download } from "../lib/dom";
import type { DirHandleLike } from "../lib/fs";
import type { BuilderConfig } from "../lib/builder/defaults";
import { presetFromSheet } from "../lib/builder/preset";
import { serializeSheet, sheetFileName, type SerializeInput } from "../lib/builder/serialize";
import { buildSheetZip } from "./ziprun";
import type { Placement } from "../lib/builder/serialize";
import type { SheetLayout } from "../lib/builder/layout";
import { exportSheet, sheetPngOf, type PngScale } from "./exportrun";

/** What the panel gives the export: the sheet it is looking at. */
export interface ExportSource {
  root: DirHandleLike | null;
  config: BuilderConfig;
  layout: SheetLayout;
  placements: readonly Placement[];
  title: string;
  subtitle: string;
  seed: number;
  slots: readonly (string | null)[];
  locked: readonly string[];
}

export interface BuilderExportState {
  scale: PngScale;
  setScale: (scale: PngScale) => void;
  busy: string | null;
  last: string | null;
  downloadSvg: () => void;
  downloadPng: () => void;
  downloadZip: () => Promise<void>;
  commit: () => Promise<void>;
}

export function useBuilderExport(source: ExportSource): BuilderExportState {
  const [scale, setScale] = useState<PngScale>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const svg = () => serializeSheet(inputOf(source));
  const name = () => sheetFileName(source.config);
  return {
    scale,
    setScale,
    busy,
    last,
    downloadSvg: () => { download(new Blob([svg()], { type: "image/svg+xml" }), name()); setLast(`Downloaded ${name()}`); },
    downloadPng: () => { void runPng({ source, scale, setBusy, setLast, svg, name }); },
    downloadZip: () => runZip({ source, scale, setBusy, setLast }),
    commit: () => runCommit({ source, scale, setBusy, setLast }),
  };
}

/** The serializer input for the sheet on screen. */
function inputOf(source: ExportSource): SerializeInput {
  return {
    config: source.config, layout: source.layout, placements: source.placements,
    title: source.title, subtitle: source.subtitle,
  };
}

interface Setters {
  setBusy: (s: string | null) => void;
  setLast: (s: string | null) => void;
}

/** The PNG download: rendered from the same SVG text, named with its real size. */
async function runPng(a: Setters & {
  source: ExportSource; scale: PngScale; svg: () => string; name: () => string;
}): Promise<void> {
  a.setBusy("Rendering the PNG…");
  try {
    const art = a.source.config.artboard;
    const blob = await sheetPngOf(a.svg(), art.width, art.height, a.scale);
    const pngName = a.name().replace(/\.svg$/, `@${a.scale}x.png`);
    download(blob, pngName);
    a.setLast(`Downloaded ${pngName}`);
  } catch {
    a.setLast("The PNG could not be rendered in this browser");
  } finally {
    a.setBusy(null);
  }
}

/** The ZIP download: SVG + PNG + preset, one file. */
async function runZip(a: Setters & { source: ExportSource; scale: PngScale }): Promise<void> {
  a.setBusy("Packing the ZIP…");
  try {
    const blob = await zipBlob(a.source, a.scale);
    const zipName = sheetFileName(a.source.config).replace(/\.svg$/, ".zip");
    download(blob, zipName);
    a.setLast(`Downloaded ${zipName}`);
  } finally {
    a.setBusy(null);
  }
}

/** The commit: into builder/ only, create-only, with the outcome stated. */
async function runCommit(a: Setters & { source: ExportSource; scale: PngScale }): Promise<void> {
  if (a.source.root === null) return a.setLast("Pick a folder first");
  a.setBusy("Saving into builder/…");
  try {
    const done = await exportSheet({
      root: a.source.root, input: inputOf(a.source), preset: presetOf(a.source), scale: a.scale, onStep: a.setBusy,
    });
    a.setLast(commitMessage(done));
  } finally {
    a.setBusy(null);
  }
}

/** The preset that reproduces this sheet. */
function presetOf(source: ExportSource) {
  return presetFromSheet("Saved sheet", {
    config: source.config,
    selection: { slots: [...source.slots], locked: [...source.locked], seed: source.seed },
  });
}

/** What a commit actually did — never "saved" when nothing was written. */
function commitMessage(done: { ok: boolean; written: string[]; reason: string | null }): string {
  if (done.ok) return `Saved ${done.written.join(", ")} into builder/`;
  if (done.written.length === 0) return done.reason ?? "Nothing was written";
  return `Saved ${done.written.join(", ")} — ${done.reason ?? "the rest failed"}`;
}

/** The ZIP the UI offers: the SVG, the PNG and the preset, built from the live sheet. */
async function zipBlob(source: ExportSource, scale: PngScale): Promise<Blob> {
  return buildSheetZip({ input: inputOf(source), preset: presetOf(source), scale });
}

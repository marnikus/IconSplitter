// ziprun.ts — the in-browser ZIP: one file that carries the whole reproducible
// sheet (the editable SVG, the PNG the user asked for, and the preset JSON that
// reproduces it). Shared by the download button and the commit, so both write the
// same bytes.

import JSZip from "jszip";
import { serializeSheet, sheetFileName, type SerializeInput } from "../lib/builder/serialize";
import { presetJson, type BuilderPreset } from "../lib/builder/preset";
import { sheetPngOf, type PngScale } from "./exportrun";

export interface ZipRequest {
  input: SerializeInput;
  preset: BuilderPreset;
  scale: PngScale;
}

/** The sheet's ZIP: SVG + PNG + preset JSON. */
export async function buildSheetZip(request: ZipRequest): Promise<Blob> {
  const svg = serializeSheet(request.input);
  const name = sheetFileName(request.input.config);
  const a = request.input.config.artboard;
  const png = await sheetPngOf(svg, a.width, a.height, request.scale);
  const zip = new JSZip();
  zip.file(name, svg);
  zip.file(name.replace(/\.svg$/, `@${request.scale}x.png`), png);
  zip.file(name.replace(/\.svg$/, ".preset.json"), presetJson(request.preset));
  return zip.generateAsync({ type: "blob" });
}

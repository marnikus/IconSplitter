// uploadrows.ts — the upload row as the panel sees it, built in ONE place.
// A suite that is about the UI or the run states only what its case is about;
// the scan's SvgSource and the approved version come from the svgpair helpers.
import { rowFromSource } from "../../src/upload/rows";
import { pairMetaFor, svgSource, svgVersion, type SrcOpts } from "./svgpair";

/** A row for `name`, approved at version 1 unless the caller says otherwise. */
export function iconRow(name: string, options: SrcOpts = {}, version = 1): ReturnType<typeof rowFromSource> {
  const source = svgSource(name, options);
  const file = `${source.dirPath}/${source.stem}_v${version}.svg`;
  return rowFromSource(source, pairMetaFor(source, [svgVersion(file, { version, review: "approved" })]));
}

export type { SrcOpts };

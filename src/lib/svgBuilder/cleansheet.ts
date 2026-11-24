// cleansheet.ts — the sheet package's clean copy (2026-11-19). The pass itself
// is `lib/upload/svgclean` (shared with the upload chain since 2026-11-20); what
// the builder adds is the page rule: a sheet's root keeps its px width/height,
// because the package sizes its JPEG and 2× PNG from them. The icon contract
// (`verifyExportSvg`) would strip them, which is why the upload caller passes
// `keepSize: false` and this one does not.
import { cleanSvgText, type SvgCleanReport, type SvgCleanResult } from "../upload/svgclean";

export type SheetCleanReport = SvgCleanReport;
export type SheetCleanResult = SvgCleanResult;

/** The finished sheet's cleaned copy; the input string is untouched. */
export function cleanSheetSvg(svgText: string, resolveCurrentColor = false, skipReport = false): SheetCleanResult {
  return cleanSvgText(svgText, { keepSize: true, resolveCurrentColor, skipReport });
}

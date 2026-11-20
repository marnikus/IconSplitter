/// <reference types="vite/client" />
// settingsfingerprint.ts — only output-affecting Upload settings enter the export fingerprint.
// Template suffixes are conditional: existing effects-off packages retain their fingerprint.
import shadowTemplate from "../../svg/templates/shadow.svg?raw";
import badgeTemplate from "../../svg/templates/editable-stroke-width.svg?raw";
import sizeLabelSmall from "../../svg/templates/size-s.svg?raw";
import sizeLabelLarge from "../../svg/templates/size-l.svg?raw";
import { fnv1a32 } from "../pairing";
import { paddingToken } from "./padding";
import type { UploadSettings } from "./settings";

const templateHash = fnv1a32(shadowTemplate).toString(16);
const sizeGuideTemplateHash = fnv1a32(sizeLabelSmall + sizeLabelLarge).toString(16);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The 2026-11-09…17 geometry additions: stroke expansion, text outlines, the full-artboard rescale. */
function expansionTokens(s: UploadSettings): unknown[] {
  return [
    ...(s.expandStrokes ? ["expand"] : []),
    ...(s.expandText ? ["expandtext"] : []),
    ...(s.rescaleArtboard ? [["rescale", round3(s.rescaleMegapixels), s.rescaleStrokes]] : []),
  ];
}

export function settingsFingerprint(s: UploadSettings): string {
  const canonical = JSON.stringify([
    paddingToken(s.paddingPct), s.background, round3(s.strokePx), s.strokeColor,
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
    s.jpegMatchArtboard,
    [s.artboard.mode, s.artboard.size, s.artboard.width, s.artboard.height],
    // The converter is a tool choice, not geometry. Older fingerprints must not move.
    ...(s.strokeLinecap !== "source" ? [["linecap", s.strokeLinecap]] : []),
    ...expansionTokens(s),
    ...(s.scaleToMegapixels ? [["mp", round3(s.artboardMegapixels)]] : []),
    // The bundled graphic keeps its old hash (existing packages stay current); a user template hashes its own code.
    ...(s.shadowEnabled ? [["shadow", s.shadowWidthPct, s.shadowGapPct, s.shadowTemplateSvg ? fnv1a32(s.shadowTemplateSvg).toString(16) : templateHash]] : []),
    ...(s.badgeEnabled ? [["badge", s.badgeCorner, s.badgeWidthPct, s.badgeOffsetXPct, s.badgeOffsetYPct, fnv1a32(s.badgeTemplateSvg || badgeTemplate).toString(16)]] : []),
    ...formatToken(s),
    ...(s.cleanExport === false ? [[["clean", false]]] : []),
    ...(s.sizeGuideEnabled ? [["sizeguide", s.sizeGuideCorner, s.sizeGuideSmallPct, s.sizeGuideLargePct,
      round3(s.sizeGuideSmallStrokePx), round3(s.sizeGuideLargeStrokePx), s.sizeGuideGapPct,
      s.sizeGuideOffsetXPct, s.sizeGuideOffsetYPct, sizeGuideTemplateHash]] : []),
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

// `cleanExport` moves the hash only when it is OFF (2026-11-20): the stock clean
// policy runs either way in `prepare.ts`, but the shared clean copy
// (`lib/upload/svgclean`) is asked for by the box, so a package built with it
// off is not the same file. The default (on) keeps every legacy hash.

/** Explicit disabled outputs change the package; legacy/default flags must not churn hashes. */
function formatToken(s: UploadSettings): unknown[] {
  return s.includeSvg === false || s.includeJpeg === false
    ? [["formats", s.includeSvg !== false, s.includeJpeg !== false]] : [];
}

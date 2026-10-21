/// <reference types="vite/client" />
// settingsfingerprint.ts — only output-affecting Upload settings enter the export fingerprint.
// Template suffixes are conditional: existing effects-off packages retain their fingerprint.
import shadowTemplate from "../../svg/templates/shadow.svg?raw";
import badgeTemplate from "../../svg/templates/editable-stroke-width.svg?raw";
import sizeLabelSmall from "../../svg/templates/size-s.svg?raw";
import sizeLabelLarge from "../../svg/templates/size-l.svg?raw";
import { fnv1a32 } from "../pairing";
import type { UploadSettings } from "./settings";

const templateHash = fnv1a32(shadowTemplate).toString(16);
const badgeTemplateHash = fnv1a32(badgeTemplate).toString(16);
const sizeGuideTemplateHash = fnv1a32(sizeLabelSmall + sizeLabelLarge).toString(16);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function settingsFingerprint(s: UploadSettings): string {
  const canonical = JSON.stringify([
    s.paddingPct === null ? "default" : round3(s.paddingPct), s.background, round3(s.strokePx), s.strokeColor,
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
    s.jpegMatchArtboard,
    [s.artboard.mode, s.artboard.size, s.artboard.width, s.artboard.height],
    // The converter is a tool choice, not geometry. Older fingerprints must not move.
    ...(s.expandStrokes ? ["expand"] : []),
    ...(s.scaleToMegapixels ? [["mp", round3(s.artboardMegapixels)]] : []),
    ...(s.shadowEnabled ? [["shadow", s.shadowWidthPct, s.shadowGapPct, templateHash]] : []),
    ...(s.badgeEnabled ? [["badge", s.badgeCorner, s.badgeWidthPct, s.badgeOffsetXPct, s.badgeOffsetYPct, badgeTemplateHash]] : []),
    ...(s.sizeGuideEnabled ? [["sizeguide", s.sizeGuideCorner, s.sizeGuideSmallPct, s.sizeGuideLargePct,
      round3(s.sizeGuideSmallStrokePx), round3(s.sizeGuideLargeStrokePx), s.sizeGuideGapPct,
      s.sizeGuideOffsetXPct, s.sizeGuideOffsetYPct, sizeGuideTemplateHash]] : []),
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

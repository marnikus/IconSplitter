// epsidentity.ts — the DSC comment lines that identify a FILE rather than draw
// it (2026-11-24, RULE 26; docs/archive/2026-11-24-eps-identity-scrub): the
// title (an internal work name), producer, user, date and copyright lines, and
// Illustrator's private `%AI<n>_…` comments (a claim of an application that did
// not write the file). They are comments: removing them never changes what the
// program draws, which is why both the scrub (`epsclean.stripEpsIdentity`) and
// the artwork audit (`epsmetadata.verifiedEpsArtwork`) use this one rule.
// Pure and dependency-free so either module can import it.

/** DSC lines that name the file, the producer or the moment, never the artwork. */
const IDENTITY_LINES = /^%%(?:Title|Creator|CreationDate|For|Copyright|CopyrightNotice)\b[^\r\n]*(?:\r\n|\r|\n|$)/gm;
/** Illustrator's thumbnail: the comment AND its hex `%%BeginData` … `%%EndData` block. */
const AI_THUMBNAIL = /^%AI7_Thumbnail:[^\r\n]*(?:\r\n|\r|\n)%%BeginData:[^\r\n]*(?:\r\n|\r|\n)[\s\S]*?^%%EndData[^\r\n]*(?:\r\n|\r|\n|$)/gm;
/** Every other Illustrator private comment (`%AI5_ArtSize`, `%AI3_TemplateBox`, `%AI9_ColorModel`…). */
const AI_LINES = /^%AI\d+_[^\r\n]*(?:\r\n|\r|\n|$)/gm;

/** The EPS without its identity comment lines. Idempotent; the program is untouched. */
export function stripEpsIdentityLines(eps: string): string {
  let out = /^%%(?:Ti|Cr|Fo|Co)/m.test(eps) ? eps.replace(IDENTITY_LINES, "") : eps;
  if (/^%AI\d/m.test(out)) out = out.replace(AI_THUMBNAIL, "").replace(AI_LINES, "");
  return out;
}

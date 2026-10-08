// sentpreview.ts — the rule behind "the image you approve is the image that is
// sent" (design §2.4, RULE 15). A prepared preview is one approved SVG rendered
// as the JPEG the request carries, bound to the row id AND the source file's
// fingerprint: the confirmation can only ever show, and the runner can only ever
// send, a preview that belongs to that exact icon and that exact file. Pure
// rules, so the identity is testable without a browser.

/** The preview's square size in px — the one number the dialog and the wire share. */
export const PREVIEW_PX = 512;

/** How many previews the confirmation renders (and shows) at most (RULE 12). */
export const PREVIEW_LIMIT = 24;

/** The MIME type of the sent preview: a JPEG of the approved SVG. */
export const PREVIEW_MIME = "image/jpeg";

/** One icon's prepared preview: the exact data URL the request will carry. */
export interface SentPreview {
  /** The row this image belongs to (`pairId(dir, base, suffix)`). */
  id: string;
  /** The approved SVG's file name — what the row shows beside its own image. */
  name: string;
  /** `size:mtime` of that SVG when this preview was rendered. */
  fingerprint: string;
  /** `data:image/jpeg;base64,…` — shown in the dialog and sent unchanged. */
  image: string;
}

/** Renders one SVG document to a data URL of `size` px (injectable in tests). */
export type PreviewRender = (svgText: string, size: number) => Promise<string>;

/**
 * The preview to send for THIS icon and THIS source revision, or null when there
 * is none: a preview rendered for another row, or for an older revision of the
 * same file, is never sent — the runner re-renders instead of sending a stale or
 * mismatched image.
 */
export function previewFor(previews: readonly SentPreview[], id: string, fingerprint: string): SentPreview | null {
  if (fingerprint === "") return null;
  return previews.find((p) => p.id === id && p.fingerprint === fingerprint) ?? null;
}

/** The previews the strip shows, plus how many the limit left out. */
export function capPreviews(previews: readonly SentPreview[]): { shown: SentPreview[]; hidden: number } {
  return { shown: previews.slice(0, PREVIEW_LIMIT), hidden: Math.max(0, previews.length - PREVIEW_LIMIT) };
}

/** The decoded byte count of a base64 data URL; 0 when it is not one. */
export function previewBytes(image: string): number {
  const comma = image.indexOf(",");
  if (!image.startsWith("data:") || comma < 0) return 0;
  const payload = image.slice(comma + 1).replace(/=+$/, "");
  return Math.floor((payload.length * 3) / 4);
}

/** What the dialog says under one preview: the file, the format, the weight. */
export function previewCaption(preview: SentPreview): string {
  const kb = (previewBytes(preview.image) / 1024).toFixed(1);
  return `${preview.name} · ${PREVIEW_MIME} · ${PREVIEW_PX}×${PREVIEW_PX} · ${kb} KB · sent unchanged`;
}

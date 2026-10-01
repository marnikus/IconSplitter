// preview.ts — turning saved SVG text into a safe preview (prompt §11/§16).
// Owns the one rule that makes a preview harmless: the document is shown as an
// IMAGE, never as markup, so a saved SVG can never run script or load anything
// in the panel. Pure — the data URL is built from text the sidecar already
// validated, and an empty document simply has no preview.

/** `data:image/svg+xml,…` for a validated SVG document, or null. */
export function svgPreviewUrl(text: string | null): string | null {
  if (text === null) return null;
  const body = text.trim();
  if (body === "") return null;
  if (!body.startsWith("<")) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
}

/** True when a document can be previewed at all (avoids a broken image). */
export function hasPreview(text: string | null): boolean {
  return svgPreviewUrl(text) !== null;
}

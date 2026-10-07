// metapreview.ts — preparing the images the metadata confirmation shows and the
// request sends (design §2.4). Each selected icon's OWN approved SVG is read and
// rendered with the ONE preview primitive the runner uses, so the bytes on
// screen are the bytes on the wire; the result is bound to the row id and the
// file's fingerprint, and a bad icon is dropped instead of breaking the dialog
// (RULE 5/12). Nothing here talks to the network.

import type { DirHandleLike } from "../lib/fs";
import {
  PREVIEW_LIMIT, PREVIEW_PX, type PreviewRender, type SentPreview,
} from "../lib/upload/sentpreview";
import { readSvgText } from "../svg/svgfiles";
import { renderPreviewDataUrl } from "./runmetadata";

/** The file identity a preview is about — the row's export source, nothing else. */
export interface PreviewSources {
  id: string;
  svgPath: string;
  svgName: string;
  fingerprint: string;
}

export interface PreviewArgs {
  root: DirHandleLike;
  sources: readonly PreviewSources[];
  ids: readonly string[];
  /** The render primitive (tests inject one; the app uses the real canvas). */
  render?: PreviewRender;
  limit?: number;
}

/**
 * The previews for a selection, in the selection's order: at most `limit`
 * (RULE 12), one per icon, each from that icon's own approved SVG. A file that
 * cannot be read, or cannot be rendered, is left out — the confirmation then
 * says for how many icons no image could be shown, and the runner renders those
 * at send time.
 */
export async function preparePreviews(args: PreviewArgs): Promise<SentPreview[]> {
  const render = args.render ?? renderPreviewDataUrl;
  const limit = args.limit ?? PREVIEW_LIMIT;
  const byId = new Map(args.sources.map((s) => [s.id, s]));
  const out: SentPreview[] = [];
  for (const id of args.ids.slice(0, limit)) {
    const source = byId.get(id);
    if (source === undefined) continue;
    const svgText = await readSvgText(args.root, source.svgPath);
    if (svgText === null) continue;
    try {
      out.push({ id, name: source.svgName, fingerprint: source.fingerprint, image: await render(svgText, PREVIEW_PX) });
    } catch {
      // one unrenderable icon never costs the others their preview
    }
  }
  return out;
}

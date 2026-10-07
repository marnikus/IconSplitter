// reembed.ts — the metadata-only re-stamp (merge report §5 P0 and R12: an edited
// accepted record changes what the package carries "without triggering a fresh
// model call", and a selective rebuild must not forget an output it did not
// touch). The published SVG and the published JPEG keep their artwork and
// receive the edited text; nothing is rendered and no request is sent, because a
// 15 MP re-render for a renamed title is waste and could change bytes nobody
// asked to change. The EPS the package already holds is the caller's to carry.

import { insertMetadata, verifyMetadata } from "../lib/svgupload/jpegseg";
import type { MetaText } from "../lib/svgupload/mime";

export interface ReembedArgs {
  /** Reads the files an earlier run published; null for whatever is missing. */
  read: () => Promise<{ svg: string | null; jpg: Uint8Array | null }>;
  meta: MetaText;
  /** The caller's document embedder — it re-stamps and proves the read-back. */
  embed: (svg: string) => string | null;
}

export type ReembedOut =
  | { ok: true; svg: string; jpg: Uint8Array }
  | { ok: false; reason: string };

export async function reembedFiles(args: ReembedArgs): Promise<ReembedOut> {
  const published = await args.read();
  if (published.svg === null || published.jpg === null) {
    return { ok: false, reason: "The published files could not be read, so the edited metadata could not be written into them." };
  }
  const svg = args.embed(published.svg);
  if (svg === null) return { ok: false, reason: "" }; // the embedder already recorded WHY
  const jpg = stampedJpeg(published.jpg, args.meta);
  if (jpg === null) return { ok: false, reason: "The JPEG metadata did not read back as the accepted values." };
  return { ok: true, svg, jpg };
}

/** Writes the accepted text into an existing JPEG and proves the read-back. */
function stampedJpeg(bytes: Uint8Array, meta: MetaText): Uint8Array | null {
  const out = insertMetadata(bytes, meta);
  if (!out.ok) return null;
  return verifyMetadata(out.bytes, meta).ok ? out.bytes : null;
}

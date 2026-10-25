// imagechoice.ts — accepting a saved AI image as the actual source. The same
// pointer drives the thumbnail and subsequent generation; choosing it also
// accepts the pair's source decision, never the independent SVG review.
import type { DirHandleLike } from "../lib/fs";
import { withDecision, type PairMeta } from "../lib/pairmeta";
import { mainImageOf } from "../lib/svgimgreg";
import { log } from "../log/logstore";
import { saveMetaAt } from "../selection/pairstore";
import type { SvgCtx } from "./actions";
import { readReferenceImage } from "./imgregfiles";
import { reserveSources, SOURCE_BUSY } from "./jobstate";
import { withMeta } from "./rowmodel";
import type { SvgRow } from "./types";

export type ImageChoiceCtx = Pick<SvgCtx, "refs" | "rows" | "say" | "setRowsFn">;

/** Source lease and save-first semantics are shared by original and history chips. */
export async function chooseMainImage(c: ImageChoiceCtx, id: string, version: number | null): Promise<void> {
  const release = reserveSources(c, [id], "image");
  if (release === null) return c.say(SOURCE_BUSY, true);
  try { await saveMainImage(c, id, version); } finally { release(); }
}

async function saveMainImage(c: ImageChoiceCtx, id: string, version: number | null): Promise<void> {
  const root = c.refs.root.current as DirHandleLike | null;
  const row = c.rows.find((r) => r.source.id === id);
  if (root === null || row === undefined) return c.say("No folder is open — the choice cannot be saved", true);
  const prev = c.refs.metas.get(id) ?? row.meta;
  if (prev === null) return c.say("This pair has no record file yet — regenerate its image first", true);
  const error = await imageChoiceError(root, row, prev, version);
  if (error !== null) return c.say(error, true);
  const meta = { ...withDecision(prev, "approved", new Date().toISOString()), imagePreferred: version };
  try {
    await saveMetaAt(root, row.source.metaPath, meta);
  } catch {
    return c.say(`The choice for ${row.source.name} could not be saved — nothing changed`, true);
  }
  c.refs.metas.set(id, meta);
  c.setRowsFn((rs) => rs.map((r) => (r.source.id === id ? withMeta(r, meta) : r)));
  log({ feature: "svg", action: "image-main", ids: { source: id }, detail: version === null ? "accepted original" : `accepted v${version}` });
  c.say(version === null ? "AI source: the original is accepted as main" : `AI source: v${version} is accepted as main — the SVG generation uses it`);
}

/** Reject a corrupt record, unusable version or missing bytes before persisting acceptance. */
async function imageChoiceError(root: DirHandleLike, row: SvgRow, meta: PairMeta, version: number | null): Promise<string | null> {
  if (row.corrupt) return "Its pair file is unreadable — nothing changed";
  if (version !== null && !meta.imageVersions.some((v) => v.version === version && v.status === "done")) {
    return "That image version is not a completed image — nothing changed";
  }
  const path = mainImageOf({ ...meta, imagePreferred: version }, row.source.relPath);
  const image = await readReferenceImage(root, path);
  return image !== null && image.size > 0 ? null : "The selected AI image is missing or unreadable — nothing changed";
}

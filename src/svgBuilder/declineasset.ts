// declineasset.ts — 🗑 on an artboard icon (2026-11-13): take the icon out of
// "approved" for good when it passed validation but is not a good product after
// all. It is the same decision as "Remove" in SVG to upload / Upload: the item is
// declined in Generate SVG (svg/declineitems) with one "svgReview" history entry,
// so Undo approves it again and Redo declines it again. Nothing here edits the
// builder for the click: the builder follows every decision written to files
// (`useBuilderReviewFollower`), so a click, an undo and a redo all update it the
// same way — a declined icon leaves the library, the sheet and the locks; an
// icon approved again comes back with a rescan.
import { useEffect, useRef } from "react";
import { declineItems } from "../svg/declineitems";
import { onSvgReviewsWritten, type SvgReviewRec } from "../svg/reviewundo";
import { emptySlotFor } from "../lib/svgBuilder/slots";
import type { BuilderActionContext } from "./actiontypes";
import type { BuilderApi } from "./useSvgBuilder";
import { BUILDER_HANDLE_KEY } from "./scan";

const SPEC = { handleKey: BUILDER_HANDLE_KEY, from: "the SVG builder", activity: "svgBuilder", alsoGone: " — it leaves the builder library and the sheet" };

export async function declineBuilderAsset(ctx: BuilderActionContext, id: string): Promise<boolean> {
  const asset = ctx.assets.find((a) => a.id === id);
  if (asset === undefined) { ctx.say("That icon is no longer in the library", true); return false; }
  if (ctx.hist === null) { ctx.say("Undo is not available here — nothing was removed", true); return false; }
  return declineItems({ say: ctx.say, hist: ctx.hist }, [{ id, metaPath: asset.metaPath }], SPEC);
}

/** Declined icons leave the library, the sheet (their cells stay empty) and the locks; an approved one it lacks needs a rescan. */
export function reactToBuilderReviews(b: BuilderApi, recs: readonly Pick<SvgReviewRec, "id" | "review">[]): { rescan: boolean } {
  const known = new Set(b.assets.map((a) => a.id));
  const gone = new Set(recs.filter((r) => r.review !== "approved" && known.has(r.id)).map((r) => r.id));
  if (gone.size > 0 && b.discovery !== null) {
    b.actions.dropAssets([...gone]);
  }
  return { rescan: recs.some((r) => r.review === "approved" && !known.has(r.id)) };
}

/** The mounted builder follows every item decision written to files, wherever it came from. */
export function useBuilderReviewFollower(b: BuilderApi): void {
  const latest = useRef(b);
  latest.current = b;
  useEffect(() => onSvgReviewsWritten((recs) => {
    if (reactToBuilderReviews(latest.current, recs).rescan && latest.current.root !== null) latest.current.actions.rescan();
  }), []);
}

/** Placements without the dropped icons: each leaves an empty cell, never a shifted sheet. */
export function withoutAssets(placed: readonly string[], drop: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of placed) out.push(drop.has(id) ? emptySlotFor([...placed, ...out]) : id);
  return out;
}

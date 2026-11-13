// actions/decline.ts — 🗑 decline an icon (2026-11-13) and follow a decline
// written to files (declineasset.ts). Following is not an edit of its own: the
// cells empty quietly; the "svgReview" history entry is what Undo reverses.
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { declineBuilderAsset, withoutAssets } from "../declineasset";

export function declineActions(get: () => BuilderActionContext): Pick<BuilderActions, "declineAsset" | "dropAssets"> {
  return {
    declineAsset: (id) => { void declineBuilderAsset(get(), id); },
    dropAssets: (ids) => dropAssets(get(), ids),
  };
}

function dropAssets(ctx: BuilderActionContext, ids: readonly string[]): void {
  const discovery = ctx.discovery;
  if (discovery === null) return;
  const drop = new Set(ids);
  ctx.setDiscovery({
    ...discovery, assets: discovery.assets.filter((a) => !drop.has(a.id)), rows: discovery.rows.filter((r) => !drop.has(r.id)),
  });
  ctx.dispatch({ lockedIds: ctx.model.lockedIds.filter((id) => !drop.has(id)), excludedIds: ctx.model.excludedIds.filter((id) => !drop.has(id)) });
  if (ctx.placedIds.some((id) => drop.has(id))) ctx.setCheckedQuiet(withoutAssets(ctx.placedIds, drop));
}

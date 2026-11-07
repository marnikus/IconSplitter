// actions/selection.ts — one global selection timeline for placed assets.
import { configUndoPatchOf } from "../model";
import { builderUndoPatchOf } from "../../lib/svgBuilder/undo";
import { saveSheetConfig } from "../configstore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

type SelectionActions = Pick<BuilderActions, "toggleAsset" | "toggleLock" | "clearSelection">;

export function selectionActions(get: () => BuilderActionContext): SelectionActions {
  return {
    toggleAsset: (id) => toggleAsset(get(), id),
    toggleLock: (id) => toggleLock(get(), id),
    clearSelection: () => get().setChecked({ checked: [], anchor: null, active: null }, "Clear placed assets"),
  };
}

function toggleAsset(ctx: BuilderActionContext, id: string): void {
  const has = ctx.checked.checked.includes(id);
  const checked = has ? ctx.checked.checked.filter((x) => x !== id) : [...ctx.checked.checked, id];
  ctx.setChecked({ checked, anchor: id, active: id }, has ? "Remove an asset from the sheet" : "Place an approved asset");
}

function toggleLock(ctx: BuilderActionContext, id: string): void {
  const has = ctx.model.lockedIds.includes(id);
  const lockedIds = has ? ctx.model.lockedIds.filter((x) => x !== id) : [...ctx.model.lockedIds, id];
  const before = configUndoPatchOf(ctx.model);
  const after = builderUndoPatchOf({ ...before, lockedIds });
  ctx.hist?.push({ type: "builderConfig", label: has ? "Unlock an asset" : "Lock an asset",
    origin: "svgBuilder", ids: [id], before, after });
  ctx.dispatch({ lockedIds });
  saveSheetConfig(ctx.model.config);
}

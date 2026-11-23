// actions/styles.ts — STYLES (2026-11-23): which icon styles may be in sheets
// (lib/svgBuilder/iconstyles.ts). The choice is a remembered preference; the
// library and every pick follow it at once (useBuilderComputed `pickable`). Icons
// of a style no longer allowed leave the current sheet — their cells stay, empty,
// their locks go — as ONE undo step. Saved artboards are never changed.
import { multiText, type Multi } from "../../lib/multifilter";
import { ALL_STYLES, offStyleIds, styleLabel } from "../../lib/svgBuilder/iconstyles";
import { placedOnly, withEmptyFor } from "../../lib/svgBuilder/slots";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { prefs } from "./config";

export function styleActions(get: () => BuilderActionContext): Pick<BuilderActions, "setStyleFilter"> {
  return { setStyleFilter: (next) => setStyleFilter(get(), next) };
}

function setStyleFilter(ctx: BuilderActionContext, next: Multi<string>): void {
  prefs(ctx, { styles: next });
  const off = new Set(offStyleIds(ctx.placedIds, next));
  if (off.size === 0) return ctx.say(`Styles in sheets: ${multiText(next, ALL_STYLES, styleLabel) || "all styles"}`);
  const checked = withEmptyFor(ctx.placedIds, (id) => off.has(id));
  ctx.setChecked({ checked, anchor: null, active: placedOnly(checked)[0] ?? null }, "Styles filter");
  const lockedIds = ctx.model.lockedIds.filter((id) => !off.has(id));
  if (lockedIds.length !== ctx.model.lockedIds.length) ctx.dispatch({ lockedIds });
  ctx.say(`${off.size} icon(s) of an unchecked style left the sheet — Reshuffle fills the empty cells`);
}

// actions/usage.ts — saved icon use (2026-11-13). When a sheet is exported (SVG
// or PNG; not a clipboard copy), each icon on it gets one more use in its
// `<svg>.usage.json`, saved for good. An open final artboard counts each icon
// once (its `countedIds`), so exporting it again does not count twice; an icon
// added later counts at the next export. A plain sheet (no artboard open)
// counts once per session for the same icons and look.
import { configFingerprint } from "../../lib/svgBuilder/config";
import { placedOnly } from "../../lib/svgBuilder/slots";
import type { UsageRecord } from "../../lib/svgBuilder/usage";
import type { BuilderActionContext } from "../actiontypes";
import { saveArtboards } from "../artboardstore";
import { recordUse } from "../usagestore";

const countedSheets = new Set<string>();

/** Which icons this export adds use for, and where it is remembered. */
function toCount(ctx: BuilderActionContext, at: string): { ids: string[]; label: string } {
  const ids = [...new Set(placedOnly(ctx.placedIds))];
  const artboard = ctx.model.artboards.find((a) => a.id === ctx.model.editingArtboardId);
  if (artboard !== undefined) {
    const fresh = ids.filter((id) => !artboard.countedIds.includes(id));
    const artboards = ctx.model.artboards.map((a) => (a.id === artboard.id ? { ...a, exportedAt: at, countedIds: [...a.countedIds, ...fresh] } : a));
    ctx.dispatch({ artboards });
    saveArtboards(artboards);
    return { ids: fresh, label: `${artboard.id} ${artboard.name}` };
  }
  const key = `${configFingerprint(ctx.model.config)}|${ids.join(",")}`;
  if (countedSheets.has(key)) return { ids: [], label: "sheet" };
  countedSheets.add(key);
  return { ids, label: "sheet (no artboard)" };
}

export async function countExportedUse(ctx: BuilderActionContext): Promise<void> {
  const root = ctx.model.root;
  const discovery = ctx.model.discovery;
  if (root === null || discovery === null) return;
  const at = new Date().toISOString();
  const plan = toCount(ctx, at);
  if (plan.ids.length === 0) return;
  const { records, failed } = await recordUse({ root, assets: ctx.assets, ids: plan.ids, artboard: plan.label, at });
  const usage = new Map<string, UsageRecord>(discovery.usage);
  for (const [id, r] of records) usage.set(id, r);
  ctx.dispatch({ discovery: { ...discovery, usage } });
  if (failed.length > 0) ctx.say(`Use could not be saved for ${failed.length} icon(s) — the folder may be read-only`, true);
}

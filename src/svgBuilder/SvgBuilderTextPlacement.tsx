// SvgBuilderTextPlacement.tsx — "Text placement" in the Banner section
// (2026-11-13): Text padding moves the title and the subtitle together in from
// the banner's starting edge (2026-11-14: the title too, in every style); Move X / Y
// shift the title and the subtitle by exact pixels (type a value, or step it
// with the arrow keys). Part of the sheet's look, so a saved template keeps it.
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { Edit } from "./SvgBuilderCustomize";
import { Field, NumBox, Slider } from "./SvgBuilderFields";
import { canRebalance, isColumn, rebalancedBanner } from "../lib/svgBuilder/rebalance";
import RowProportions from "./SvgBuilderRowProportions";

type Banner = SheetConfig["banner"];
type MoveKey = "titleDx" | "titleDy" | "subtitleDx" | "subtitleDy";

export default function TextPlacement({ n, edit, span }: { n: Banner; edit: Edit; span: number }) {
  const moved = n.textPadding !== 0 || n.titleDx !== 0 || n.titleDy !== 0 || n.subtitleDx !== 0 || n.subtitleDy !== 0;
  const reset = () => edit("banner", { textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0 });
  return <div className="bld-text-placement" data-testid="builder-text-placement">
    <Slider label="Text padding · title + subtitle" value={n.textPadding} range={RANGES.textPadding} unit="px" testid="builder-text-padding"
      onChange={(textPadding) => edit("banner", { textPadding }, true)} />
    <MoveRow label="Move title" n={n} x="titleDx" y="titleDy" testid="builder-title-move" edit={edit} />
    <MoveRow label="Move subtitle" n={n} x="subtitleDx" y="subtitleDy" testid="builder-subtitle-move" edit={edit} />
    <button type="button" className="svg-btn tiny" data-testid="builder-text-placement-reset" disabled={!moved} onClick={reset}
      title="Back to the reference placement: no padding, no moves">↺ Reset text placement</button>
    {canRebalance(n) && <button type="button" className="svg-btn tiny primary" data-testid="builder-banner-rebalance"
      onClick={() => edit("banner", rebalancedBanner(n, span))}
      title="Every text on one line, and equal space between the banner edges, the icon, the title, the divider and the subtitle">{isColumn(n) ? "⇔ Rebalance column" : "⇔ Rebalance row"}</button>}
    {canRebalance(n) && <label className="bld-check" title="Rebalance the row again whenever the texts or sizes change">
      <input type="checkbox" data-testid="builder-banner-auto-rebalance" checked={n.autoRebalance}
        onChange={(e) => edit("banner", e.target.checked ? { autoRebalance: true, ...rebalancedBanner(n, span) } : { autoRebalance: false })} /> Auto rebalance</label>}
    {canRebalance(n) && <RowProportions banner={n} prefix="builder-banner" onChange={(patch) => edit("banner", patch, true)} />}
    {n.edgeSpread && <button type="button" className="svg-btn tiny" data-testid="builder-banner-rebalance-off"
      onClick={() => edit("banner", { edgeSpread: false })} title="Back to the centred group with fixed gaps">Centred row</button>}
  </div>;
}

function MoveRow({ label, n, x, y, testid, edit }: {
  label: string; n: Banner; x: MoveKey; y: MoveKey; testid: string; edit: Edit;
}) {
  return <Field label={label}>
    <div className="bld-two">
      <NumBox label="X" unit="px" value={n[x]} range={RANGES.textOffset} testid={`${testid}-x`} onCommit={(v, g) => edit("banner", { [x]: v }, g)} />
      <NumBox label="Y" unit="px" value={n[y]} range={RANGES.textOffset} testid={`${testid}-y`} onCommit={(v, g) => edit("banner", { [y]: v }, g)} />
    </div>
  </Field>;
}

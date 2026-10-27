import type { CheckState } from "../lib/reviewselect";
import { Select, ToggleField } from "../ui/fields";
import { STOCK_DESTINATIONS } from "../lib/stockupload/destinations";
import type { StockPreferences } from "../lib/stockupload/preferences";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import type { TransferPlan } from "../lib/stockupload/types";
import UploadRowBadgeApply from "../upload/UploadRowBadgeApply";
import BulkBarShell from "../ui/BulkBarShell";
import UploadThumbnailZoom from "../upload/UploadThumbnailZoom";
import StockPresets from "./StockPresets";
import { startStockUpload, cancelStockUpload } from "./actions";
import { extensionRuntime } from "../lib/stockupload/native";
export interface ToolbarProps {
  header: CheckState;
  prefs: StockPreferences; update: (patch: Partial<StockPreferences>) => void; selected: string[]; badgeIds: string[];
  visibleCount: number; hiddenCount: number; badges: RowBadgeState; onApply: (ids: string[], badge: string) => void;
  onSelect: (on: boolean) => void; onToggleAll: (on: boolean) => void;
  plan: TransferPlan; busy: boolean; canCancel: boolean; epsReviewed: boolean; onReview: (value: boolean) => void;
}
export default function StockToolbar(p: ToolbarProps) {
  return <div className="svg-bulkbar-pin" data-testid="stock-toolbar">
    <BulkBarShell testid="stock-bulk" disabled={p.busy} header={p.header}
      checkedCount={p.selected.length} visibleCount={p.visibleCount} hiddenCount={p.hiddenCount}
      onToggleAll={p.onToggleAll} onSelectVisible={() => p.onSelect(true)} onDeselectAll={() => p.onSelect(false)} right={<BulkActions p={p} />} />
    <StockDestinations p={p} />
  </div>;
}
function BulkActions({ p }: { p: ToolbarProps }) {
  return <>
    <UploadThumbnailZoom id="stock-thumb" thumb={p.prefs.zoom} onThumb={zoom => p.update({ zoom })} />
    <UploadRowBadgeApply state={p.badges} ids={p.badgeIds} onApply={p.onApply} />
    <button type="button" className="svg-btn primary" data-testid="stock-upload-start" disabled={p.busy || p.prefs.destinations.length === 0 || !extensionRuntime() || p.plan.files.length === 0}
      onClick={() => void startStockUpload(p.plan.files, p.epsReviewed)}>Upload · {p.plan.files.length} files</button>
    {p.canCancel && <button type="button" className="svg-btn danger" onClick={cancelStockUpload}>Cancel batch</button>}
  </>;
}
function StockDestinations({ p }: { p: ToolbarProps }) {
  return <div className="svg-bulk"><fieldset className="up-shadow-fields w-full" disabled={p.busy}><legend className="svg-label">Destination presets & formats</legend>
    <StockPresets prefs={p.prefs} update={p.update} />
    <div className="up-bg-row">
      <Select label="Stock destination" testid="stock-destination" value="shutterstock" options={STOCK_DESTINATIONS.map(stock => [stock.id, stock.name])} />
      {STOCK_DESTINATIONS.map(stock => <ToggleField key={stock.id} label={`${stock.name} · explicit FTPS`} checked={p.prefs.destinations.includes(stock.id)} onChange={on => p.update({ destinations: on ? [...p.prefs.destinations, stock.id] : p.prefs.destinations.filter(id => id !== stock.id) })} />)}
      <Formats p={p} />
    </div>
    <ToggleField label="EPS reviewed for Illustrator 8/10 compatibility and 4–25 MP bounds" checked={p.epsReviewed} onChange={p.onReview} />
  </fieldset></div>;
}
function Formats({ p }: { p: ToolbarProps }) {
  return <>
    <ToggleField label="JPEG / PNG" checked={p.prefs.formats.raster} onChange={raster => p.update({ formats: { ...p.prefs.formats, raster } })} hint="JPEG only at Shutterstock" />
    <ToggleField label="EPS" checked={p.prefs.formats.eps} onChange={eps => p.update({ formats: { ...p.prefs.formats, eps } })} />
    <ToggleField label="SVG" checked={false} disabled title="Not documented as a Shutterstock upload format" />
    <ToggleField label="ZIP" checked={false} disabled title="Not documented as a Shutterstock upload format" />
  </>;
}

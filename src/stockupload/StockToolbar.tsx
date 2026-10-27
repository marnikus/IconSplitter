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
  prefs: StockPreferences; update: (patch: Partial<StockPreferences>) => void; selected: string[]; badgeIds: string[];
  visibleCount: number; hiddenCount: number; badges: RowBadgeState; onApply: (ids: string[], badge: string) => void;
  onSelect: (on: boolean) => void; onToggleAll: (on: boolean) => void;
  plan: TransferPlan; busy: boolean; canCancel: boolean; epsReviewed: boolean; onReview: (value: boolean) => void;
}
export default function StockToolbar(p: ToolbarProps) {
  return <div className="svg-bulkbar-pin" data-testid="stock-toolbar">
    <BulkBarShell testid="stock-bulk" disabled={p.busy} header={p.selected.length === 0 ? "none" : p.selected.length === p.visibleCount ? "all" : "some"}
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
      <label className="svg-field"><span className="svg-label">Stock</span><select className="svg-input" aria-label="Stock destination"><option>Shutterstock</option></select></label>
      {STOCK_DESTINATIONS.map(stock => <label className="up-bg-row" key={stock.id}><input type="checkbox" checked={p.prefs.destinations.includes(stock.id)} onChange={e => p.update({ destinations: e.target.checked ? [...p.prefs.destinations, stock.id] : p.prefs.destinations.filter(id => id !== stock.id) })} /> {stock.name} · explicit FTPS</label>)}
      <Formats p={p} />
    </div>
    <label className="up-bg-row"><input type="checkbox" checked={p.epsReviewed} onChange={e => p.onReview(e.target.checked)} /> EPS reviewed for Illustrator 8/10 compatibility and 4–25 MP bounds</label>
  </fieldset></div>;
}
function Formats({ p }: { p: ToolbarProps }) {
  return <>
    <label className="up-bg-row"><input type="checkbox" checked={p.prefs.formats.raster} onChange={e => p.update({ formats: { ...p.prefs.formats, raster: e.target.checked } })} /> JPEG / PNG <small className="up-hint">(JPEG only at Shutterstock)</small></label>
    <label className="up-bg-row"><input type="checkbox" checked={p.prefs.formats.eps} onChange={e => p.update({ formats: { ...p.prefs.formats, eps: e.target.checked } })} /> EPS</label>
    <label className="up-bg-row" title="Not documented as a Shutterstock upload format"><input type="checkbox" disabled /> SVG</label>
    <label className="up-bg-row" title="Not documented as a Shutterstock upload format"><input type="checkbox" disabled /> ZIP</label>
  </>;
}

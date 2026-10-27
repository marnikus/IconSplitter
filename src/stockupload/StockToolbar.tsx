import { STOCK_DESTINATIONS } from "../lib/stockupload/destinations";
import type { StockPreferences } from "../lib/stockupload/preferences";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import type { TransferPlan } from "../lib/stockupload/types";
import UploadRowBadgeApply from "../upload/UploadRowBadgeApply";
import StockPresets from "./StockPresets";
import { startStockUpload, cancelStockUpload } from "./actions";
import { extensionRuntime } from "../lib/stockupload/native";
export interface ToolbarProps {
  prefs: StockPreferences; update: (patch: Partial<StockPreferences>) => void; selected: string[]; badgeIds: string[];
  badges: RowBadgeState; onApply: (ids: string[], badge: string) => void; onSelect: (on: boolean) => void;
  plan: TransferPlan; busy: boolean; canCancel: boolean; epsReviewed: boolean; onReview: (value: boolean) => void;
}
export default function StockToolbar(p: ToolbarProps) {
  return <div className="stock-toolbar" data-testid="stock-toolbar"><div className="stock-tools">
    <button disabled={p.busy} onClick={() => p.onSelect(true)}>Select visible</button><button disabled={p.busy} onClick={() => p.onSelect(false)}>Deselect all</button>
    <span>{p.selected.length} selected</span><label>Zoom <input type="range" min="48" max="200" value={p.prefs.zoom} onChange={e => p.update({ zoom: Number(e.target.value) })} /></label>
    <UploadRowBadgeApply state={p.badges} ids={p.badgeIds} onApply={p.onApply} />
    <button className="primary" disabled={p.busy || p.prefs.destinations.length === 0 || !extensionRuntime() || p.plan.files.length === 0}
      onClick={() => void startStockUpload(p.plan.files, p.epsReviewed)}>Upload · {p.plan.files.length} files</button>
    {p.canCancel && <button onClick={cancelStockUpload}>Cancel batch</button>}
  </div><fieldset disabled={p.busy}><legend>Destination presets & formats</legend><StockPresets prefs={p.prefs} update={p.update} />
    {STOCK_DESTINATIONS.map(stock => <label key={stock.id}><input type="checkbox" checked={p.prefs.destinations.includes(stock.id)} onChange={e => p.update({ destinations: e.target.checked ? [...p.prefs.destinations, stock.id] : p.prefs.destinations.filter(id => id !== stock.id) })} /> {stock.name} · explicit FTPS</label>)}
    <label>Stock <select aria-label="Stock destination"><option>Shutterstock</option></select></label>
    <Formats p={p} /><label><input type="checkbox" checked={p.epsReviewed} onChange={e => p.onReview(e.target.checked)} /> EPS reviewed for Illustrator 8/10 compatibility and 4–25 MP bounds</label>
  </fieldset></div>;
}
function Formats({ p }: { p: ToolbarProps }) {
  return <span className="stock-formats"><label><input type="checkbox" checked={p.prefs.formats.raster} onChange={e => p.update({ formats: { ...p.prefs.formats, raster: e.target.checked } })} /> JPEG / PNG <small>(JPEG only at Shutterstock)</small></label>
    <label><input type="checkbox" checked={p.prefs.formats.eps} onChange={e => p.update({ formats: { ...p.prefs.formats, eps: e.target.checked } })} /> EPS</label>
    <label title="Not documented as a Shutterstock upload format"><input type="checkbox" disabled /> SVG</label>
    <label title="Not documented as a Shutterstock upload format"><input type="checkbox" disabled /> ZIP</label></span>;
}

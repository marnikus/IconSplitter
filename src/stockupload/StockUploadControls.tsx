// StockUploadControls.tsx — top controls of the "Upload" tab: Open folder +
// full root path, Rescan, counts, StockFtpPanel, and general Badge / Sort bar.

import type { UploadFormatKey } from "../lib/stockupload/types";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import StockFtpPanel from "./StockFtpPanel";
import type { StockUploadSort } from "./rowlist";
import { stockAuditLine } from "./scan";
import type { StockUploadApi } from "./useStockUpload";

export default function StockUploadControls({ g }: { g: StockUploadApi }) {
  return (
    <section className="svg-controls" aria-label="Upload controls">
      <SourceBar g={g} />
      <StockFtpPanel
        presetState={g.presetState}
        ftpOpen={g.model.prefs.ftpOpen}
        bridgeUrl={g.model.prefs.bridgeUrl}
        credSaved={g.model.credSaved}
        testStatus={g.model.testStatus}
        actions={g}
        onToggleOpen={(ftpOpen) => g.setPrefs({ ftpOpen })}
        onBridgeUrl={(bridgeUrl) => g.setPrefs({ bridgeUrl })}
      />
      <FilterBar g={g} />
    </section>
  );
}

function SourceBar({ g }: { g: StockUploadApi }) {
  const disc = g.model.discovery;
  const total = g.items.length;
  return (
    <>
      <div className="svg-toolbar">
        <div className="svg-source">
          <OpenFolderButton testid="stock-open-folder" onClick={g.chooseRoot} />
          {g.model.rootName !== "" && (
            <button type="button" className="svg-btn" data-testid="stock-rescan"
              disabled={g.model.busy !== null} onClick={g.rescan}>
              {g.model.busy ?? "↻ Rescan"}
            </button>
          )}
          <span className="svg-recursive" data-testid="stock-scope-copy">
            Exported packages only (`export/` + `export.json`) · {total} items
          </span>
          {disc !== null && <span className="svg-audit" data-testid="stock-audit">{stockAuditLine(disc)}</span>}
        </div>
        <div className="svg-summary">
          <span className="svg-chip" data-testid="stock-count-items"><strong>{total}</strong>exported</span>
          <span className="svg-chip approved" data-testid="stock-count-visible"><strong>{g.visible.length}</strong>shown</span>
        </div>
      </div>
      <FolderPathRow root={g.rootRef.current} testid="stock-folder-path" />
    </>
  );
}

function FilterBar({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg-toolbar" data-testid="stock-filters">
      <SearchAndFormatFilters g={g} />
      <BadgeFilterControl g={g} />
      <SortAndResetControls g={g} />
    </div>
  );
}

function SearchAndFormatFilters({ g }: { g: StockUploadApi }) {
  const f = g.model.filter;
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Search</span>
        <input className="svg-input" type="search" placeholder="Name, folder, title, tag…"
          data-testid="stock-filter-search" value={f.search}
          onChange={(e) => g.setFilter({ search: e.target.value })} />
      </label>
      <label className="svg-field">
        <span className="svg-label">Format present</span>
        <select className="svg-input" data-testid="stock-filter-format" value={f.format}
          onChange={(e) => g.setFilter({ format: e.target.value as "all" | UploadFormatKey })}>
          <option value="all">Any format</option>
          <option value="raster">Has JPEG/PNG</option>
          <option value="svg">Has SVG</option>
          <option value="eps">Has EPS</option>
          <option value="zip">ZIP available</option>
        </select>
      </label>
    </>
  );
}

function BadgeFilterControl({ g }: { g: StockUploadApi }) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Badge</span>
        <select className="svg-input" data-testid="stock-filter-badge" aria-label="Badge" value={g.model.filter.badge}
          onChange={(e) => g.setFilter({ badge: e.target.value })}>
          <option value="all">All badges</option>
          <option value="none">No badges</option>
          <option value="any">Any badge</option>
          {g.rowBadges.catalog.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <button type="button" className="svg-btn" data-testid="stock-rowbadges-open" onClick={g.openRowBadges}>
        Badges…
      </button>
    </>
  );
}

function SortAndResetControls({ g }: { g: StockUploadApi }) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Sort</span>
        <select className="svg-input" data-testid="stock-sort" value={g.model.sort}
          onChange={(e) => g.setSort(e.target.value as StockUploadSort)}>
          <option value="path">Folder / path</option>
          <option value="name">Item name</option>
          <option value="selected">Selected first</option>
        </select>
      </label>
      <button type="button" className="svg-btn" data-testid="stock-clear-filters" onClick={g.clearFilters}>
        Reset filters
      </button>
    </>
  );
}

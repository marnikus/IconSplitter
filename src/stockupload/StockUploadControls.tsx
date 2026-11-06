// StockUploadControls.tsx — top controls of the "Upload" tab: Open folder +
// full root path, Rescan, counts, StockFtpPanel, and general Badge / Sort bar.


import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import StockFtpPanel from "./StockFtpPanel";
import type { StockListFilter, StockUploadSort } from "./rowlist";
import { stockAuditLine } from "./scan";
import type { StockUploadApi } from "./useStockUpload";
import SearchField from "../ui/SearchField";
import MultiSelect from "../ui/MultiSelect";
import { badgeFilterOptions } from "../upload/UploadRowBadgeFilter";

const FORMAT_OPTS: [string, string][] = [
  ["all", "Any format"], ["raster", "Has JPEG/PNG"], ["svg", "Has SVG"], ["eps", "Has EPS"], ["zip", "ZIP available"],
];

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
        onDownloadGettyCsv={g.downloadGettyCsv}
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
      <SearchField testid="stock-filter-search" value={f.search} placeholder="Name, folder, title, tag or status…"
        onChange={(search) => g.setFilter({ search })} />
      <MultiSelect label="Format present" testid="stock-filter-format" value={f.format}
        options={FORMAT_OPTS} onChange={(format) => g.setFilter({ format: format as StockListFilter["format"] })} />
    </>
  );
}

function BadgeFilterControl({ g }: { g: StockUploadApi }) {
  return (
    <>
      <MultiSelect label="Badge" testid="stock-filter-badge" value={g.model.filter.badge}
        options={badgeFilterOptions(g.rowBadges.catalog)} onChange={(badge) => g.setFilter({ badge })} />
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

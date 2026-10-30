// UploadRowBadgeFilter.tsx — badge filter select + settings button (I-79).
import type { RowBadge } from "../lib/upload/rowbadge";
import type { UploadListFilter } from "./types";

export default function UploadRowBadgeFilter({ filter, catalog, onFilter, onOpen }: {
  filter: UploadListFilter;
  catalog: readonly RowBadge[];
  onFilter: (patch: Partial<UploadListFilter>) => void;
  onOpen: () => void;
}) {
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">Badge</span>
        <select className="svg-input" data-testid="upload-filter-badge" aria-label="Badge" value={filter.badge}
          onChange={(e) => onFilter({ badge: e.target.value })}>
          <option value="all">All badges</option>
          <option value="none">No badges</option>
          <option value="any">Any badge</option>
          {catalog.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <button type="button" className="svg-btn" data-testid="upload-rowbadges-open" onClick={onOpen}>Badges…</button>
    </>
  );
}

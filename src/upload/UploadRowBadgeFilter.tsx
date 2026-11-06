// UploadRowBadgeFilter.tsx — badge filter select + settings button (I-79).
import type { RowBadge } from "../lib/upload/rowbadge";
import type { UploadListFilter } from "./types";
import MultiSelect from "../ui/MultiSelect";

/** All / none / any, then every catalog badge — the one list both upload tabs filter by. */
export function badgeFilterOptions(catalog: readonly RowBadge[]): [string, string][] {
  return [["all", "All badges"], ["none", "No badges"], ["any", "Any badge"], ...catalog.map((b): [string, string] => [b.id, b.name])];
}

export default function UploadRowBadgeFilter({ filter, catalog, onFilter, onOpen }: {
  filter: UploadListFilter;
  catalog: readonly RowBadge[];
  onFilter: (patch: Partial<UploadListFilter>) => void;
  onOpen: () => void;
}) {
  return (
    <>
      <MultiSelect label="Badge" testid="upload-filter-badge" value={filter.badge}
        options={badgeFilterOptions(catalog)} onChange={(badge) => onFilter({ badge })} />
      <button type="button" className="svg-btn" data-testid="upload-rowbadges-open" onClick={onOpen}>Badges…</button>
    </>
  );
}

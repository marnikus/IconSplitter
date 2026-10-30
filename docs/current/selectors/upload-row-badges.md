# SVG to upload — row badge selectors

Selector priority: [shared conventions](shared.md#i-selector-object-structure--for-every-element).
Behaviour: [row badges](../sor/upload-row-badges.md). Part of [upload selectors](upload.md).

| Test id | Element | Notes |
|---|---|---|
| `upload-rowbadges-open` | button | **Badges…** in the filter row; opens the catalog dialog |
| `upload-filter-badge` | `<select>` | All / No badges / Any badge / each catalog name |
| `upload-rowbadge-dialog` | `role="dialog"` | catalog CRUD; backdrop `upload-rowbadge-backdrop`, close `upload-rowbadge-close` |
| `upload-rowbadge-new-name` / `upload-rowbadge-new-color` / `upload-rowbadge-add` | add row | name + colour + **Add badge** |
| `upload-rowbadge-empty` | note | shown while the catalog is empty |
| `upload-rowbadge-item-{id}` | list item | one catalog row |
| `upload-rowbadge-name-{id}` / `upload-rowbadge-color-{id}` / `upload-rowbadge-remove-{id}` | inputs + button | rename, recolour, remove |
| `upload-rowbadges-{pairId}` | chip row | under the file cell |
| `upload-rowbadge-chip-{pairId}-{badgeId}` | button | applied chip; plain left-click removes from that row; Ctrl + left-click removes the same badge from all checked rows |
| `upload-rowbadge-toggle-{pairId}` | **+ Badge** | opens `upload-rowbadge-pop-{pairId}` |
| `upload-rowbadge-option-{pairId}-{badgeId}` | button | `aria-pressed` while that row has the badge |
| `upload-rowbadge-apply` | bulk button | disabled at 0 selected or empty catalog |
| `upload-rowbadge-apply-list` | menu | one `upload-rowbadge-apply-{badgeId}` per catalog entry |

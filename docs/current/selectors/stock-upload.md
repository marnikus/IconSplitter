# Selectors — Upload (`stockUpload`)

Behaviour: [sor/stock-upload](../sor/stock-upload.md).

## Shell & source bar
- `tab-stock-upload` — top navigation button (`"Upload"`).
- `stock-upload-shell`, `stock-upload-panel`, `stock-upload-unsupported`, `stock-pick-root` — panel containers.
- `stock-upload-progress-mount` — cross-tab portal mount for in-flight FTPS progress.
- `stock-open-folder`, `stock-rescan`, `stock-folder-path`, `stock-scope-copy`, `stock-audit` — folder picker, rescan, and full root path bar.

## Stock FTP presets & local-only credentials (`StockFtpPanel.tsx`)
- `stock-ftp-panel`, `stock-ftp-toggle`, `stock-ftp-active-name` — collapsible preset panel.
- `stock-ftp-preset-select`, `stock-ftp-new-name`, `stock-ftp-add`, `stock-ftp-delete`, `stock-ftp-reset-shutterstock` — stock preset dropdown & CRUD.
- `stock-ftp-host`, `stock-ftp-port`, `stock-ftp-protocol`, `stock-ftp-remotedir`, `stock-ftp-tls`, `stock-ftp-pin`, `stock-ftp-bridge-url` — per-stock connection settings.
- `stock-ftp-cred-status`, `stock-ftp-user`, `stock-ftp-pass`, `stock-ftp-cred-save`, `stock-ftp-cred-forget`, `stock-ftp-test`, `stock-ftp-test-note`, `stock-ftp-trust-cert` — local-only non-expanded credentials & connection test.

## Filters, badges & pinned bulk bar
- `stock-filters`, `stock-filter-search`, `stock-filter-format`, `stock-filter-status`, `stock-filter-badge`, `stock-rowbadges-open`, `stock-sort`, `stock-clear-filters` — filter/sort bar & badge catalog button.
- `stock-bulkbar-pin`, `stock-bulk`, `stock-check-all`, `stock-selected-count`, `stock-select-visible`, `stock-deselect` — pinned selection controls (`stockUploadChecked` undo).
- `stock-upload-zoom`, `stock-zoom-label`, `stock-bg-<preset>` — thumbnail zoom slider & preview background.
- `stock-format-raster`, `stock-format-svg`, `stock-format-eps`, `stock-format-zip` — same-stem representation checkboxes.
- `stock-target-check-<presetId>` — multi-upload target stock checkboxes.
- `stock-upload-start`, `stock-upload-cancel`, `stock-upload-confirm-dialog`, `stock-upload-confirm-go`, `stock-upload-confirm-cancel` — preflight confirmation & upload trigger.

## Rows & local metadata (`StockUploadRow.tsx`, `StockUploadMetaFields.tsx`)
- `stock-rows`, `stock-row-<id>`, `stock-check-<id>`, `stock-prev-<id>` — row container, checkbox, and zoomed preview.
- `stock-name-<id>`, `stock-path-<id>`, `stock-formats-<id>`, `stock-history-<id>` — stem, `export/` path, available formats, and per-site upload status.
- `stock-location-<id>`, `stock-meta-btn-<id>` — copy folder path & expand metadata actions.
- `stock-meta-fields-<id>`, `stock-meta-title-<id>`, `stock-meta-description-<id>`, `stock-meta-tags-<id>`, `stock-meta-accept-<id>`, `stock-meta-state-<id>` — local metadata editor & in-place carrier re-embedder.

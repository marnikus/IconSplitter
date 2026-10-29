# Selectors — Upload (`stockUpload`)

Behaviour: [sor/stock-upload](../sor/stock-upload.md).

## Shell & source bar
- `tab-stock-upload` — top navigation button (`"Upload"`).
- `stock-upload-shell`, `stock-upload-panel`, `stock-upload-unsupported`, `stock-pick-root` — panel containers.
- `stock-upload-progress-mount` — cross-tab portal mount for in-flight upload progress.
- `stock-open-folder`, `stock-rescan`, `stock-folder-path`, `stock-scope-copy`, `stock-audit` — folder picker, rescan, and full root path bar.

## Stock presets, Getty ESP CSV & local-only credentials (`StockFtpPanel.tsx`, `StockFtpCredentials.tsx`)
- `stock-ftp-panel`, `stock-ftp-toggle`, `stock-ftp-active-name`, `stock-ftp-quick-<presetId>` — collapsible preset panel & quick preset switch (`Shutterstock`, `Adobe Stock`, `Getty Images`, plus custom presets).
- `stock-ftp-preset-select`, `stock-ftp-new-name`, `stock-ftp-add`, `stock-ftp-delete`, `stock-ftp-reset-builtin`, `stock-getty-csv`, `stock-open-esp`, `stock-open-deepmeta` — stock preset dropdown, CRUD, built-in reset, Getty ESP metadata CSV export (`getty-esp-metadata.csv`), and direct launchers for `esp.gettyimages.com` & DeepMeta 4 (`deepmeta.creativ.zone`).
- `stock-ftp-host`, `stock-ftp-port`, `stock-ftp-protocol`, `stock-ftp-remotedir`, `stock-ftp-tls`, `stock-ftp-pin`, `stock-ftp-bridge-url` — per-stock connection settings (`esp-https`, `getty-web`, `ftps-explicit`, `sftp`, `ftps-implicit`, `ftp`); the retired local batch option is not offered. `getty-web` shows "Getty Images web upload (browser automation)" and the contributor page path (`/contribute`).
- `stock-ftp-cred-status`, `stock-ftp-user`, `stock-ftp-pass`, `stock-ftp-apikey`, `stock-ftp-apisecret`, `stock-ftp-cred-save`, `stock-ftp-cred-forget`, `stock-esp-oauth`, `stock-ftp-test`, `stock-ftp-test-note`, `stock-ftp-trust-cert` — local-only non-expanded credentials ("Getty contributor e-mail or account ID" + password for `getty-web`), Getty OAuth2 PKCE browser authorization, & connection test (for `getty-web` it signs the helper's background browser in without creating a batch).

## Filters, unified badges & pinned bulk bar
- `stock-filters`, `stock-filter-search`, `stock-filter-format`, `stock-filter-badge`, `stock-rowbadges-open`, `stock-sort`, `stock-clear-filters` — filter/sort bar & unified badge catalog button.
- `stock-bulkbar-pin`, `stock-bulk`, `stock-check-all`, `stock-selected-count`, `stock-select-visible`, `stock-deselect` — pinned selection controls (`stockUploadChecked` undo).
- `stock-upload-zoom`, `stock-zoom-label`, `stock-bg-<preset>` — thumbnail zoom slider & preview background.
- `stock-format-raster`, `stock-format-svg`, `stock-format-eps`, `stock-format-zip` — same-stem representation checkboxes.
- `stock-combine-title-description` — opt-in locally persisted combination of accepted title and description in upload copies only.
- `stock-target-check-<presetId>` — multi-upload target stock checkboxes.
- `stock-upload-start`, `stock-upload-cancel`, `stock-upload-confirm-dialog`, `stock-upload-confirm-go`, `stock-upload-confirm-cancel` — preflight confirmation & upload trigger.

## Rows & local metadata (`StockUploadRow.tsx`, `StockUploadMetaFields.tsx`)
- `stock-rows`, `stock-row-<id>`, `stock-check-<id>`, `stock-prev-<id>` — row container, checkbox, and zoomed preview.
- `stock-name-<id>`, `stock-path-<id>`, `stock-formats-<id>`, `upload-rowbadge-chip-<id>-<badgeId>` — stem, `export/` path, available formats, and unified general row badges.
- `stock-location-<id>`, `stock-meta-btn-<id>` — copy folder path & expand metadata actions.
- `stock-meta-fields-<id>`, `stock-meta-title-<id>`, `stock-meta-description-<id>`, `stock-meta-tags-<id>`, `stock-meta-accept-<id>`, `stock-meta-state-<id>` — local metadata editor & in-place carrier re-embedder.

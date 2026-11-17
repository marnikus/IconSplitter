# Selectors — Upload (`stockUpload`)

Behaviour: [sor/stock-upload](../sor/stock-upload.md).

## Shell & source bar
- `tab-stock-upload` — top navigation button (`"Upload"`).
- `stock-upload-shell`, `stock-upload-panel`, `stock-upload-unsupported`, `stock-pick-root` — panel containers.
- `stock-upload-progress-mount` — cross-tab portal mount for the upload bar
  (`stock-upload-progress-{header,title,file,track,completed,remaining,percent}`),
  ([lifecycle](../sor/process-progress.md)): `-cancel` while running, `-review`
  and `-dismiss` once finished; `complete`, or `failed` (red).
- `stock-open-folder`, `stock-rescan`, `stock-folder-path`, `stock-scope-copy`, `stock-audit` — folder picker, rescan, and full root path bar.

## Stock presets, Getty ESP CSV & local-only credentials (`StockFtpPanel.tsx`, `StockFtpCredentials.tsx`)
- `stock-ftp-panel`, `stock-ftp-toggle`, `stock-ftp-active-name`, `stock-ftp-quick-<presetId>` — collapsible preset panel & quick preset switch (`Shutterstock`, `Adobe Stock`, `Getty Images`, plus custom presets).
- `stock-ftp-body` holds three cards side by side (compact layout, 2026-11-08): `stock-ftp-connection-group` (Connection settings: Host · Port · Protocol / path · TLS · Helper URL), `stock-ftp-preset-group` (Stock preset + actions | Add preset → Stock name), `stock-ftp-cred-box` (Sign-in & test; `stock-ftp-cred-status` in the card head, account | password, Save · Forget … Test connection); the header shows an icon, the stock name and method · endpoint. `stock-ftp-help` expands the long protocol-specific credential guidance.
- `stock-ftp-preset-select`, `stock-ftp-new-name`, `stock-ftp-add`, `stock-ftp-delete`, `stock-ftp-reset-builtin`, `stock-getty-csv`, `stock-open-esp`, `stock-open-deepmeta` — stock preset dropdown, CRUD, built-in reset, Getty ESP metadata CSV export (`getty-esp-metadata.csv`), and direct launchers for `esp.gettyimages.com` & DeepMeta 4 (`deepmeta.creativ.zone`).
- `stock-ftp-host`, `stock-ftp-port`, `stock-ftp-protocol`, `stock-ftp-remotedir`, `stock-ftp-tls`, `stock-ftp-pin`, `stock-ftp-bridge-url` — per-stock connection settings (`esp-https`, `getty-web`, `ftps-explicit`, `sftp`, `ftps-implicit`, `ftp`); no retired local batch option. `getty-web` shows "Getty Images web upload (browser automation)" and the contributor page path (`/contribute`).
- Getty website automation handles and waits: see [Getty web selectors](stock-upload-getty-web.md).
- `stock-ftp-cred-status`, `stock-ftp-user`, `stock-ftp-pass`, `stock-ftp-apikey`, `stock-ftp-apisecret`, `stock-ftp-cred-save`, `stock-ftp-cred-forget`, `stock-esp-oauth`, `stock-ftp-test`, `stock-ftp-test-note`, `stock-ftp-trust-cert` — local-only non-expanded credentials (Getty e-mail/ID + password for `getty-web`), OAuth2 PKCE, & connection test (`getty-web` signs in without creating a batch).

## Filters, unified badges & pinned bulk bar
- `stock-filters`, `stock-filter-search`, `stock-filter-format`, `stock-filter-badge`, `stock-rowbadges-open`, `stock-sort`, `stock-clear-filters` — labeled **Find & filter** section with responsive filter/sort controls and unified badge catalog button.
- `stock-bulkbar-pin`, `stock-bulk`, `stock-check-all`, `stock-selected-count`, `stock-select-visible`, `stock-deselect` — pinned selection controls (`stockUploadChecked` undo). `stock-select-random` / `stock-random-count` / `stock-random-scope`: [Select random](../sor/list-selection-filters.md#select-random).
- `stock-upload-zoom`, `stock-zoom-label`, `stock-bg-<preset>` — thumbnail zoom & preview background.
- `stock-format-raster`, `stock-format-svg`, `stock-format-eps`, `stock-format-zip` — same-stem representation checks.
- `stock-combine-title-description` — opt-in, persisted title + description in upload copies only.
- `stock-random-batches` — opt-in, saved: every site draws random, mixed 100-icon batches and uploads each under a shuffled number before its name.
- `stock-target-check-<presetId>` — multi-upload target stock checkboxes.
- `stock-upload-start`, `stock-upload-cancel`, `stock-upload-confirm-dialog`, `stock-upload-confirm-note`, `stock-upload-confirm-go`, `stock-upload-confirm-cancel` — preflight confirmation, optional note (saved with each target batch), and upload trigger. `stock-upload-reupload-options` groups per-stock resubmission choices; `stock-upload-reupload-<presetId>` opts a checked stock into re-uploading its already-badged selected icons, while unchecked stocks skip only those icons.
- `stock-upload-skipped-no-metadata` — the confirmation's count of checked rows left out because they have no ACCEPTED metadata with a title, description and keyword (`src/lib/stockupload/metadatagate.ts`, 2026-11-12; a saved draft is not accepted, 2026-11-13). Such a row is never sent; when every checked row is left out, `Upload` refuses with "None of the selected rows has accepted metadata…" and no confirmation opens.
- `stock-upload-getty-batches` — the confirmation's Getty line whenever `getty-web` is a target (`250 icon(s) → 3 batches (Getty takes 100 uploads per batch; a JPEG + EPS pair counts once)`, singular `1 batch` for a short run), so the chunking (100 icons, 64 MB) is visible before Upload.

## Rows & local metadata (`StockUploadRow.tsx`, `StockUploadMetaFields.tsx`)
- `stock-rows`, `stock-row-<id>`, `stock-check-<id>`, `stock-prev-<id>` — row container, checkbox, and zoomed preview.
- `stock-name-<id>`, `stock-path-<id>`, `stock-formats-<id>`, `upload-rowbadge-chip-<id>-<badgeId>` — stem, `export/` path, available formats, and unified general row badges; plain left-click removes one row's badge, Ctrl + left-click removes it from all checked rows.
- `stock-location-<id>`, `stock-meta-btn-<id>` — copy folder path & expand metadata actions.
- `stock-meta-fields-<id>`, `stock-meta-title-<id>`, `stock-meta-description-<id>`, `stock-meta-tags-<id>`, `stock-meta-accept-<id>`, `stock-meta-state-<id>` — local metadata editor & in-place carrier re-embedder.
- `stock-remove-<id>`, `stock-remove-selected` — [Remove](../sor/svg-remove-row.md#upload).

- `stock-presets-open`, `stock-presets-popup`, `stock-presets-close`, `stock-preset-<presetId>-<raster|svg|eps|zip|title-description>`, `stock-upload-target-formats` — per-stock format/metadata choices and planned formats; details in [target options](../sor/stock-upload-target-options.md). `stock-random-batches` and `stock-upload-limit` are global.

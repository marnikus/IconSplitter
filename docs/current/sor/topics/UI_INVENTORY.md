# Earlier UI inventory

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.

* App shell: `app-shell` (one viewport column: nav → `app-main` → `log-dock`),
  `app-main` (the region that scrolls — the window never does). The global
  activity log dock is the last row of that column on **every** tab: `log-dock`,
  `log-head`, `log-count`, `log-autoscroll`, `log-max`, `log-copy`, `log-clear`,
  `log-minimize`, `log-note`, `log-body`, `log-list`, `log-entry`, `log-empty`.

* Workbench: `tab-sheets`, `tab-batch`, `tab-selection`, `tab-selection-v2`,
  `tab-generate-svg`.
* Sheets mode: header (upload + 3 export buttons), Sheets, Export settings
  (padding/size/transparent), Detection (merge slider + reset), Boundary
  overlay, Result grid, busy overlay, toast.
* Batch mode: header controls (`batch-root`, `batch-refresh`, `batch-process`,
  `batch-cancel`), PresetBar (name/save/list/delete + split settings), Dest
  info, review window (`scan-table`, `select-all`, per-row checkbox/actions),
  reference warnings, busy overlay, toast.
* Selection mode: header (`sel-root`, `sel-rescan`, `sel-watcher`, counters,
  help), FilterBar (date modes + From/To, status, sort, order, clear), review
  list (`sel-list`, `sel-search`, `sel-row-*`), comparison (`sel-compare`,
  Approve/Decline, 1:1/SYNC, per-side Open-in-Explorer), status footer
  (`sel-footer`), write/corrupt banners, busy + toast.
* Selection V2 mode: source bar (`v2-root`, `v2-rescan`, `v2-watcher`,
  `v2-mode-list` / `v2-mode-compare`, `v2-count-*`), filter grid (`v2-date-*`,
  `v2-from` / `v2-to`, `v2-status`, `v2-pairing`, `v2-sort`, `v2-dir`,
  `v2-shown`, `v2-clear`), bulk bar (`v2-check-all`, `v2-selected-count`,
  `v2-scope`, `v2-blocked`, `v2-hidden`, `v2-select-visible`, `v2-deselect`,
  `v2-thumb` + `v2-thumb-value`, `v2-approve-selected`, `v2-approve-visible`),
  list (`v2-list`, `v2-rows`, `v2-row-*`, `v2-check-*`, `v2-thumb-src` /
  `v2-thumb-ai`, `v2-status-*`, `v2-open-{src,ai}-*`, `v2-decline-*` /
  `v2-approve-row-*`, `v2-autonext`, `v2-empty`, `v2-nomatch`), comparison
  (`v2-pair-picker` + the V1 `sel-compare` handles), shared surfaces
  (`v2-writewarn` / `v2-retry`, `v2-corrupt`, `v2-toast`, `v2-busy` and the
  shared `sel-footer` / `sel-diff` / `sel-retry-count`), the folder control
  (`v2-open-folder` + the read-only `v2-folder-path` row, I-44/I-46), and the
  copy prefix that row supplies. Full table: `UI_SELECTORS.md` §N.
* Generate SVG mode: the row's scan status (`svg-problem-{id}` — "AI image
  missing" / "Reference missing" / "Unreadable file" / "Files missing", with
  the full reason in the `title`), source bar (`svg-open-folder`,
  `svg-folder-path`, `svg-rescan`, `svg-count-*`), prompt + provider card
  (`svg-prompt`, `svg-prompt-reset`, the shared preset bar `svg-preset-*`, the regen window `svg-regen*` above it,
  `svg-provider`, `svg-limits`, `svg-per-request`, `svg-timeout`,
  `svg-retries`, `svg-model`, `svg-key-state`
  / `svg-key-input` / `svg-key-save`), the copy prefix (`svg-root-path`;
  `svg-choose-root` is offered while a root is loaded too, so this tab can be
  pointed by hand), filters (`svg-filter-generation`,
  `svg-filter-review`, `svg-sort`, `svg-search`, `svg-shown`,
  `svg-clear-filters`), bulk bar (`svg-check-all`, `svg-selected-count`,
  `svg-select-visible`, `svg-deselect`, `svg-thumb` + `svg-thumb-value`,
  preview background (`svg-bg`, `svg-bg-{white,black,gray,green,red}`,
  `svg-bg-custom`, `svg-bg-value`), `svg-estimate`,
  `svg-generate-selected`, `svg-regenerate-selected`, `svg-approve-selected`,
  `svg-decline-selected`, `svg-cancel-run`), list (`svg-list`, `svg-rows`,
  `svg-row-*`, `svg-check-*`, `svg-ai-*` / `svg-prev-*`,
  `svg-prev-frame-*` (the coloured frame), `svg-target-*` (the SVG the row
  owns, or the path generation will write) `svg-status-*`,
  `svg-review-*`, `svg-usage-*`, `svg-persist-*`, `svg-generate-*`,
  `svg-approve-*`, `svg-decline-*`, `svg-location-*`, `svg-copy-*`,
  `svg-code-*`, `svg-history-*` + `svg-history-cost-{n}`, `svg-empty`),
  batch strip (`svg-batch`, `svg-batch-composite`, `svg-batch-id`,
  `svg-batch-grid`, `svg-batch-counts`, `svg-batch-elapsed` (ticking
  `elapsed m:ss` while a request is in flight; the bulk bar's
  `svg-batch-progress` line carries the same clock as `svg-bulk-elapsed`), `svg-batch-reports` +
  `svg-batch-report-{n}` (with `outcome unknown` and its own elapsed time),
  `svg-batch-cancel`), confirmation
  (`svg-confirm`, `svg-confirm-title` ("Confirm SVG generation" or "Confirm SVG regeneration"),
  `svg-confirm-{count,requests,model,sampling,timeout,streaming}`,
  `svg-confirm-{close,cancel,generate}`, `svg-confirm-limit`,
  `svg-confirm-problem`, one page per request: `svg-batch-page`,
  `svg-batch-prev` / `svg-batch-next`, `svg-batch-grid`, `svg-batch-empty`,
  `svg-batch-items`, `svg-composite-img` / `svg-composite-meta` /
  `svg-composite-building` / `svg-composite-error`), image-edit confirmation
  (`svg-img-confirm`, `svg-img-per-request`, `svg-img-composite`,
  `svg-img-manifest`, `svg-img-effective-prompt`, `svg-img-skipped`,
  `svg-img-generate`), returned-grid review (`svg-img-review`,
  `svg-img-apply`, `svg-img-discard`), dialogs
  (`svg-code-dialog`, `svg-history-dialog`), banners (`svg-warn-*` and the
  in-flight recovery note `svg-inflight` with `svg-inflight-note`,
  `svg-inflight-retry`, `svg-inflight-dismiss`, plus image-edit
  `svg-img-inflight` / `svg-img-journal-warning`), status bar
  (`svg-statusbar`), toast + busy (`svg-toast`, `svg-busy`); review undo goes
  through the shared `hist-*` handles. Full table: `UI_SELECTORS.md` §P.
* SVG to upload mode: source bar (`upload-open-folder`, `upload-folder-path`,
  `upload-rescan`, `upload-scope-copy`, `upload-audit`,
  `upload-count-{icons,processed,partial,failed,stale}`), settings button +
  provider card (`upload-settings-open`, `upload-provider-card`,
  `upload-provider`, `upload-limits`, `upload-model`, `upload-endpoint`,
  `upload-timeout`, `upload-retries`, `upload-concurrency`, `upload-prompt`
  (read-only — the exact prompt), `upload-key-state` / `upload-key-mask` /
  `upload-key-note` / `upload-key-input` / `upload-key-save`), filters
  (`upload-filter-status`, `upload-filter-metadata`, `upload-sort`,
  `upload-search`, `upload-shown`, `upload-clear-filters`), bulk bar
  (`upload-check-all`, `upload-selected-count`, `upload-scope`,
  `upload-select-visible`, `upload-deselect`, `upload-thumb` +
  `upload-thumb-value`, preview background (`upload-bg`,
  `upload-bg-{white,black,gray,green,red}`, `upload-bg-custom`,
  `upload-bg-value`), `upload-estimate` / `upload-progress`,
  `upload-apply-settings`, `upload-meta-selected`,
  `upload-meta-regenerate-selected`, `upload-export-selected`,
  `upload-cancel-run`), list (`upload-list`,
  `upload-rows`, `upload-row-*`, `upload-check-*`, `upload-prev-*` +
  `upload-prev-*-frame`, `upload-target-*`, `upload-export-path-*`,
  `upload-status-*`, `upload-meta-cell-*`, `upload-settings-*` +
  `upload-settings-pinned-*`, `upload-meta-*` / `upload-settings-btn-*` /
  `upload-export-*`, the active row's detail `upload-detail-*` with the
  editable/copiable fields `upload-meta-{title,description,tags}-*` +
  `upload-copy-{title,description,tags}-*` + `upload-meta-{state,usage,detail,
  validation,accept,regen,gen}-*`), the settings dialog (`upload-dialog-*`,
  `upload-set-{padding,stroke,mp,quality,optimize,eps}`,
  `upload-set-bg-{transparent,white,black,gray,green,red,custom}`,
  `upload-set-bg-value`,
  `upload-set-stroke-color-{artwork,white,black,gray,green,red,custom}`,
  `upload-set-stroke-color-value`, `upload-set-eps-converter`,
  `upload-set-expand`, `upload-eps-helper{,-url,-check,-state}`,
  `upload-set-marker-*`, `upload-set-reset`,
  `upload-set-close`), the metadata confirmation (`upload-meta-backdrop`,
  `upload-meta-{provider,endpoint,prompt,confirm,dismiss,cancel}`,
  `upload-preview-strip` / `upload-preview-{id}` +
  `upload-preview-caption-{id}`, `upload-preview-{count,busy,none}`),
  banners (`upload-warn-{excluded,corrupt,unreadable,interrupted}`), status
  bar (`upload-statusbar`, `upload-status-{counts,provider,meta,export}`),
  toast + busy (`upload-toast`, `upload-busy`); settings undo goes through
  the shared `hist-*` handles. Full table: `UI_SELECTORS.md` §R.

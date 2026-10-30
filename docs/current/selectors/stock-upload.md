# Selectors — Upload (`stockUpload`)

Behaviour: [sor/stock-upload](../sor/stock-upload.md).

## Shell & source bar
- `tab-stock-upload` — top navigation button (`"Upload"`).
- `stock-upload-shell`, `stock-upload-panel`, `stock-upload-unsupported`, `stock-pick-root` — panel containers.
- `stock-upload-progress-mount` — cross-tab portal mount for the upload bar
  (`stock-upload-progress-{header,title,file,track,completed,remaining,percent}`),
  `complete` only if nothing failed, else `failed` (red); `stock-progress-cancel`
  while files move, `stock-progress-dismiss` (✕) once the bar is finished or the
  run returned.
- `stock-open-folder`, `stock-rescan`, `stock-folder-path`, `stock-scope-copy`, `stock-audit` — folder picker, rescan and root path bar.

## Stock presets, Getty ESP CSV & local-only credentials (`StockFtpPanel.tsx`, `StockFtpCredentials.tsx`)
- `stock-ftp-panel`, `stock-ftp-toggle`, `stock-ftp-active-name`, `stock-ftp-quick-<presetId>` — collapsible preset panel & quick switch (`Shutterstock`, `Adobe Stock`, `Getty Images`, custom).
- `stock-ftp-preset-select`, `stock-ftp-new-name`, `stock-ftp-add`, `stock-ftp-delete`, `stock-ftp-reset-builtin`, `stock-getty-csv`, `stock-open-esp`, `stock-open-deepmeta` — stock preset dropdown, CRUD, built-in reset, Getty ESP CSV export (`getty-esp-metadata.csv`), and launchers for `esp.gettyimages.com` & DeepMeta 4 (`deepmeta.creativ.zone`).
- `stock-ftp-host`, `stock-ftp-port`, `stock-ftp-protocol`, `stock-ftp-remotedir`, `stock-ftp-tls`, `stock-ftp-pin`, `stock-ftp-bridge-url` — per-stock connection settings (`esp-https`, `getty-web`, `ftps-explicit`, `sftp`, `ftps-implicit`, `ftp`); no retired local batch option. `getty-web` shows "Getty Images web upload (browser automation)" and the contributor page path (`/contribute`).
- Getty web sign-in (no captured ids): the identifier is the visible
  username/account input, else the first text input beside the password; submit is
  the form's `[type=submit]` or a control labelled
  `Sign in|Log in|Continue|Next|Submit`, else Enter; disabled fields stay
  candidates (hydration is late).
- Getty web cards (captured after a real upload): `[data-cy="contribution-file-name"]`
  names the contribution; `[data-cy="invalid-file-media"]` ("Upload failed") is a
  rejection, reported with its `ID: …` text. Every card carries
  `[data-cy="not-ready-icon"]` (`not_ready_to_submit`) while Getty ingests and
  `[data-cy="pending-icon"]` (`Ready to submit`) once it validated the file.
  Two stages: the picture (`[data-cy="image-thumbnail"]`) means the file
  **arrived**, which starts the metadata step; the ready icon **finishes** the
  run and only appears after Save metadata, so the helper re-saves after 30 s and
  re-uploads the file (same hidden uploader) when a card still lacks it.
  `readUploadState` names `withThumbnail`/`withoutThumbnail`; `metadataEditorReady`
  flags `skeleton` for `[data-cy="metadata-skeleton"]`/`.MuiSkeleton-root`-only
  drawers and `fillMetadataFields` returns the drawer's `values`
  ([metadata and repair](../sor/stock-upload-getty-web-metadata.md)).
- Getty web Complete: the control is matched by label among *enabled* buttons only;
  `completionState` reports presence/enabled so the finish waits for Getty instead
  of clicking a disabled control. Files are matched to a card by **stem**, since a
  JPEG/EPS pair is listed once, under the EPS name. The metadata drawer uses
  `md-headline`/`md-caption`/`md-created_date`/`metadata-keyword-multiselect` and
  `save-metadata`, and only enables its fields once a card is selected — a
  `metadataEditorReady` poll waits for that unlock, and Date Created
  (`textarea[name="created_date"]`) takes `MM/DD/YYYY 00:00:00 +0000`. Existing
  tags show as `[data-cy="metadata-keyword-chip"]` (or
  `[data-cy="metadata-keyword-current-count"]`): when any are there the keyword
  input is left alone, so an upload never adds a duplicate tag. Its footer button
  is `[data-cy="save-metadata"]` (label inside a `<p>`, matched by attribute, not
  by button text). Once every drawer is filled the grid is saved in one go:
  `selectAllContributions` clicks the page's own select-all control (any
  `[data-cy*="select-all"]` checkbox) when present, else Ctrl-clicks each card's
  `[data-cy="image-card"]`, then `saveMetadataEditor` runs once.
- Getty web waits: the Create Batch control, `input[name="submission_name"]` and
  `[data-cy="create-batch-confirm-button"]` must render enabled within 60 s (else a
  `timeout` naming it); an open dialog or an already-chosen submission type is
  never reopened; the batch id must differ from the one read before the click, or
  the run keeps waiting.
- Getty web progress: `GET /getty-web/progress?sessionKey=…` returns the live
  `{phase,total,uploaded,failed,listed,reloads}` counts only — no names, no page
  text. It answers 404 until the upload request has a session, so the client keeps
  polling instead of treating that as the end of the run.
- Getty web stall recovery: when the batch page lists no new file for 30 s
  (`stallMs`), the helper sends `Page.reload` (cache ignored), waits for
  `document.readyState === "complete"`, dismisses dialogs and re-attaches **only**
  the missing files through the same uploader. Two reloads at most; then the run
  fails with "stopped reacting".
- Getty web dismissals: before attaching the files and before submitting,
  `[role=dialog]`, `[role=alert]` and `[data-cy$="-error"]` scopes get their
  `Dismiss|Cancel|Close|OK|Got it` control clicked; a scope with none is left
  alone — the helper never guesses.
- Getty contributor page (driven by the helper, not the app) — captured handles `[data-cy="create-batch-button"]`, `[role="dialog"][aria-labelledby="create-batch-dialog"]` *or* `[data-cy="create-batch-dialog"]`, `[data-cy="create-batch-submission-type"]` + `role=combobox` (opens on mousedown; options in a `role=listbox` portal), `input[name="submission_name"]`, `input[name="event_id"]`, `[data-cy="create-batch-confirm-button"]`, and the hidden contribution uploader `input[type="file"][data-cy="upload-button-file-input"][multiple]` (release inputs such as `model-release-input` are never used); sign-in, the metadata editor and Complete are matched by behaviour and label, never by a captured id.
- `stock-ftp-cred-status`, `stock-ftp-user`, `stock-ftp-pass`, `stock-ftp-apikey`, `stock-ftp-apisecret`, `stock-ftp-cred-save`, `stock-ftp-cred-forget`, `stock-esp-oauth`, `stock-ftp-test`, `stock-ftp-test-note`, `stock-ftp-trust-cert` — local-only non-expanded credentials ("Getty contributor e-mail or account ID" + password for `getty-web`), Getty OAuth2 PKCE authorization, & connection test (for `getty-web` it signs the background browser in without creating a batch).

## Filters, unified badges & pinned bulk bar
- `stock-filters`, `stock-filter-search`, `stock-filter-format`, `stock-filter-badge`, `stock-rowbadges-open`, `stock-sort`, `stock-clear-filters` — filter/sort bar & badge catalog button.
- `stock-bulkbar-pin`, `stock-bulk`, `stock-check-all`, `stock-selected-count`, `stock-select-visible`, `stock-deselect` — pinned selection (`stockUploadChecked` undo).
- `stock-upload-zoom`, `stock-zoom-label`, `stock-bg-<preset>` — zoom slider & preview background.
- `stock-format-raster`, `stock-format-svg`, `stock-format-eps`, `stock-format-zip` — same-stem format checkboxes.
- `stock-combine-title-description` — opt-in, persisted combination of accepted title and description in upload copies only.
- `stock-random-batches` — opt-in, persisted: each 100-icon Getty web batch is a random draw from the remaining icons, not list order.
- `stock-target-check-<presetId>` — multi-upload target stock checkboxes.
- `stock-upload-start`, `stock-upload-cancel`, `stock-upload-confirm-dialog`, `stock-upload-confirm-go`, `stock-upload-confirm-cancel` — preflight confirmation & upload.
- `stock-upload-getty-batches` — the confirmation's Getty line when `getty-web` is a target (`250 icon(s) → 3 batches (Getty takes 100 uploads per batch; a JPEG + EPS pair counts once)`, singular `1 batch` for a short run), so the chunking (100 icons, 64 MB per request) shows before Upload.

## Rows & local metadata (`StockUploadRow.tsx`, `StockUploadMetaFields.tsx`)
- `stock-rows`, `stock-row-<id>`, `stock-check-<id>`, `stock-prev-<id>` — row container, checkbox and zoomed preview.
- `stock-name-<id>`, `stock-path-<id>`, `stock-formats-<id>`, `upload-rowbadge-chip-<id>-<badgeId>` — stem, `export/` path, formats and unified row badges; plain left-click removes one row's badge, Ctrl + left-click removes it from all checked rows.
- `stock-location-<id>`, `stock-meta-btn-<id>` — copy folder path & expand metadata actions.
- `stock-meta-fields-<id>`, `stock-meta-title-<id>`, `stock-meta-description-<id>`, `stock-meta-tags-<id>`, `stock-meta-accept-<id>`, `stock-meta-state-<id>` — metadata editor & in-place carrier re-embedder.

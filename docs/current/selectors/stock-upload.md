# Selectors — Upload (`stockUpload`)

Behaviour: [sor/stock-upload](../sor/stock-upload.md).

## Shell & source bar
- `tab-stock-upload` — top navigation button (`"Upload"`).
- `stock-upload-shell`, `stock-upload-panel`, `stock-upload-unsupported`, `stock-pick-root` — panel containers.
- `stock-upload-progress-mount` — cross-tab portal mount for the upload bar
  (`stock-upload-progress-{header,title,file,track,completed,remaining,percent}`),
  with `complete` on the header once every file is settled; `stock-progress-cancel`
  while files move, `stock-progress-dismiss` (✕, "Close upload progress") once the
  bar is finished or the run returned.
- `stock-open-folder`, `stock-rescan`, `stock-folder-path`, `stock-scope-copy`, `stock-audit` — folder picker, rescan, and full root path bar.

## Stock presets, Getty ESP CSV & local-only credentials (`StockFtpPanel.tsx`, `StockFtpCredentials.tsx`)
- `stock-ftp-panel`, `stock-ftp-toggle`, `stock-ftp-active-name`, `stock-ftp-quick-<presetId>` — collapsible preset panel & quick preset switch (`Shutterstock`, `Adobe Stock`, `Getty Images`, plus custom presets).
- `stock-ftp-preset-select`, `stock-ftp-new-name`, `stock-ftp-add`, `stock-ftp-delete`, `stock-ftp-reset-builtin`, `stock-getty-csv`, `stock-open-esp`, `stock-open-deepmeta` — stock preset dropdown, CRUD, built-in reset, Getty ESP metadata CSV export (`getty-esp-metadata.csv`), and direct launchers for `esp.gettyimages.com` & DeepMeta 4 (`deepmeta.creativ.zone`).
- `stock-ftp-host`, `stock-ftp-port`, `stock-ftp-protocol`, `stock-ftp-remotedir`, `stock-ftp-tls`, `stock-ftp-pin`, `stock-ftp-bridge-url` — per-stock connection settings (`esp-https`, `getty-web`, `ftps-explicit`, `sftp`, `ftps-implicit`, `ftp`); the retired local batch option is not offered. `getty-web` shows "Getty Images web upload (browser automation)" and the contributor page path (`/contribute`).
- Getty web sign-in (no captured ids): the identifier is the visible
  username/account input, else the first text input beside the password; the submit
  is the form's `[type=submit]` or a control labelled
  `Sign in|Log in|Continue|Next|Submit`, else Enter / `form.requestSubmit()`;
  disabled fields stay candidates, because the page hydrates late.
- Getty web cards (captured after a real upload): `[data-cy="contribution-file-name"]`
  names the contribution; `[data-cy="invalid-file-media"]` ("Upload failed") is a
  rejection, reported with its `ID: …` text. Every card carries
  `[data-cy="not-ready-icon"]` (`not_ready_to_submit`) while Getty ingests and
  `[data-cy="pending-icon"]` (`Ready to submit`) once it validated the file.
  Two stages: the card's picture (`[data-cy="image-thumbnail"]`) means the file
  **arrived**, which is what starts the metadata step; the ready icon is what
  **finishes** the run, and it only appears after Save metadata, so the helper
  re-saves after 30 s and then re-uploads the file (same hidden uploader) for the
  cards that still lack it.
- Getty web Complete: the control is matched by label among *enabled* buttons only;
  `completionState` reports presence/enabled so the finish waits for Getty instead
  of clicking a disabled control. Files are matched to a card by **stem**, since a JPEG/EPS pair
  is listed once, under the EPS name. The metadata drawer uses
  `md-headline`/`md-caption`/`md-created_date`/`metadata-keyword-multiselect` and
  `save-metadata`, and only enables its fields once a card is selected — a
  `metadataEditorReady` poll waits for that unlock, and Date Created
  (`textarea[name="created_date"]`) takes `MM/DD/YYYY 00:00:00 +0000`. Existing
  tags show as `[data-cy="metadata-keyword-chip"]` (or
  `[data-cy="metadata-keyword-current-count"]`): when any are there the keyword
  input is left alone, so an upload never adds a duplicate tag. Its footer button
  is `[data-cy="save-metadata"]` (label inside a `<p>`, so it is matched by that
  attribute, not by button text). Once every drawer is filled the grid is saved
  in one go: `selectAllContributions` clicks the page's own select-all control
  (any `[data-cy*="select-all"]` checkbox) when present, else Ctrl-clicks each
  card's `[data-cy="image-card"]`, then `saveMetadataEditor` runs once.
- Getty web waits: the Create Batch control, `input[name="submission_name"]` and
  `[data-cy="create-batch-confirm-button"]` must render enabled within 60 s (else a
  `timeout` failure naming the control); an open dialog or an already-chosen
  submission type is never reopened; the batch id must differ from the one read
  before the click, or the run keeps waiting.
- Getty web progress: `GET /getty-web/progress?sessionKey=…` returns the live
  `{phase,total,uploaded,failed,listed,reloads}` counts only — no names, no page
  text. It
  answers 404 until the upload request has a session, so the client keeps polling
  instead of treating that as the end of the run.
- Getty web stall recovery: when the batch page lists no new file for 30 s
  (`stallMs`), the helper sends `Page.reload` (cache ignored), waits for
  `document.readyState === "complete"`, dismisses dialogs and re-attaches **only**
  the files the page still misses through the same contribution uploader. Two
  reloads at most; then the run fails with "stopped reacting".
- Getty web dismissals: before attaching the run's files and before submitting,
  `[role=dialog]`, `[role=alert]` and `[data-cy$="-error"]` scopes get their
  `Dismiss|Cancel|Close|OK|Got it` control clicked. A scope with no such control is
  left alone — the helper never guesses.
- Getty contributor page (driven by the helper, not the app) — captured handles `[data-cy="create-batch-button"]`, `[role="dialog"][aria-labelledby="create-batch-dialog"]` *or* `[data-cy="create-batch-dialog"]`, `[data-cy="create-batch-submission-type"]` + `role=combobox` (opens on mousedown; options in a `role=listbox` portal), `input[name="submission_name"]`, `input[name="event_id"]`, `[data-cy="create-batch-confirm-button"]`, the hidden contribution uploader `input[type="file"][data-cy="upload-button-file-input"][multiple]` (release inputs such as `model-release-input` are never used); sign-in fields/buttons and the metadata editor + Complete control are matched by behaviour and label, never by a captured id.
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
- `stock-name-<id>`, `stock-path-<id>`, `stock-formats-<id>`, `upload-rowbadge-chip-<id>-<badgeId>` — stem, `export/` path, available formats, and unified general row badges; plain left-click removes one row's badge, Ctrl + left-click removes it from all checked rows.
- `stock-location-<id>`, `stock-meta-btn-<id>` — copy folder path & expand metadata actions.
- `stock-meta-fields-<id>`, `stock-meta-title-<id>`, `stock-meta-description-<id>`, `stock-meta-tags-<id>`, `stock-meta-accept-<id>`, `stock-meta-state-<id>` — local metadata editor & in-place carrier re-embedder.

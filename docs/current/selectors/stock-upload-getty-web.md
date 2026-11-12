# Selectors — Getty web upload

Detailed helper-driven Getty contributor page handles for [Stock Upload](stock-upload.md).

- Getty web sign-in (no captured ids): the identifier is the visible
  username/account input, else the first text input beside the password; submit is
  the form's `[type=submit]` or a control labelled
  `Sign in|Log in|Continue|Next|Submit`, else Enter; disabled fields stay
  candidates, because the page hydrates late.
- Getty web cards (captured after a real upload): `[data-cy="contribution-file-name"]`
  names the contribution; `[data-cy="invalid-file-media"]` ("Upload failed") is a
  rejection, reported with its `ID: …` text. Every card carries
  `[data-cy="not-ready-icon"]` (`not_ready_to_submit`) while Getty ingests and
  `[data-cy="pending-icon"]` (`Ready to submit`) once it validated the file.
  Two stages: the picture (`[data-cy="image-thumbnail"]`) means the file
  **arrived**, which starts the metadata step; the ready icon **finishes** the
  run, and it only appears after Save metadata, so the helper re-saves after 30 s
  and then re-uploads the file (same hidden uploader) when a card still lacks it.
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
  `{phase,total,uploaded,failed,listed,reloads}` counts only. It
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
- Getty waits, said out loud (2026-11-12): the bar's note `stock-upload-wait` (counter + next step + attempt) / `stock-upload-activity`, and `stock-upload-wait-skip` (↻ Retry now) — see [what it waits for](../sor/stock-upload-getty-waits.md).

# SVG to upload — bulk metadata regeneration (2026-10-09)

## 1. Ask and acceptance criteria

Add a global **Regenerate metadata** action to the "SVG to upload" bulk bar.
It operates on the current checkbox selection, but only for selected rows whose
`row.meta.metadata !== null`. Rows with no metadata stay out of the paid batch;
the existing **Generate metadata** action remains the separate path for them.

## 2. Decisions

1. **Selection is necessary, existing text is necessary.** The count and action
   both use a row-model helper over the checked IDs. It returns only rows with
   non-null metadata, in row order. The count is 0 and the button disabled when
   no checked row can be regenerated. The action filters again against the live
   model before opening a confirmation, so an empty row cannot enter the batch
   through stale UI state or a mixed selection.
2. **The existing metadata pipeline is reused.** The new action opens the same
   exact-request confirmation and runs the same confirmed batch, preview and
   progress path as generation. The dialog identifies the operation as
   regeneration and states that the new answer replaces current text; a valid
   answer remains a draft until the user accepts it. Errors/timeouts keep the
   prior metadata according to the existing row request behavior.
3. **Generation stays separate.** `Generate metadata (N)` continues to count
   selected rows with null metadata and never replaces an existing answer.
   `Regenerate metadata (N)` counts only selected rows with non-null metadata
   and never requests empty rows. `Export selected` is unchanged.

## 3. Owners

| Owner | Change |
|---|---|
| `src/upload/rowmodel.ts` | Pure `idsWithMetadata(rows, ids)` predicate for bulk counts and filtering |
| `src/upload/metaselect.ts`, `actions.ts`, `metaactions.ts` | Separate regeneration action, live filtering, shared request dialog and batch |
| `src/upload/UploadBulkBar.tsx`, `UploadPanel.tsx` | Global button, selected-existing count, typed wiring |
| `src/upload/types.ts`, `UploadMetaDialog.tsx` | Dialog mode and explicit regeneration/replace wording |
| `tests/upload_rowmodel.test.ts`, `tests/upload_ui.test.tsx` | Exact filter test and real mixed-selection/batch test |
| `docs/current/SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md` | Current behavior, selector, archive map |

## 4. TDD and verification

1. Test `idsWithMetadata` with a mixed selected set and prove the empty row is
   excluded; the test must fail before production code exists.
2. Drive the real upload panel: generate metadata for two rows, add an empty
   row to the selection, then regenerate. Assert the regeneration count and
   dialog/previews cover only the two rows with metadata, exactly two new
   requests complete, and the empty row remains empty. Also pin the disabled
   zero-count state.
3. Run the focused row-model and upload UI suites, then the repository's full
   verification workflow (`npm run verify`). Recheck RULE 16 and RULE 18 and
   append the measured result to `docs/current/QUALITY_RECHECK.md`.

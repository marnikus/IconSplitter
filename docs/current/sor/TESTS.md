# Test inventory by task

No frozen test count: consult the runner for current measurements. The focused suites use synthetic images, in-memory filesystem fakes and happy-dom. Tests must exercise real logic (RULE 8). How the runner is laid out and how DOM tests settle: [test harness](../TEST_HARNESS.md).

- [Sheets and batch](tests/core.md)
- [Selection and pairing](tests/selection.md)
- [Generate SVG and AI-source image edits](tests/svg.md) · [prompt, regeneration and review suites](tests/svg-prompt-review.md)
- [SVG to upload](tests/upload.md)
- [SVG builder](tests/svg-builder.md)
- Stock Upload (`stockUpload`): `stockupload_batchhistory.test.ts` covers validated per-stock history, caps and safe full paths; `stockupload_batchsummary.test.ts` covers run-result text; `stockupload_runner.test.ts` covers transfer outcomes; `stockupload_rejected.test.ts` / `stockupload_rejected_removal.test.ts` cover pasted rejected-file parsing, stem matching, badge removal and history edits; `stockupload_ui.test.tsx` covers dialog, file rows, the Remove unsuccessful uploads dialog with undo, enlarged preview, current-list selection and recorded run counts.
- [Shared log, secrets and gate tooling](tests/shared.md)

## Acceptance expectation

Must exist before the matching change ships:

* any new exported lib/batch function → a test that fails if it is deleted
* sheet/batch UI flows → component tests using the owning `selectors/` page handles when first needed
* ZIP/folder export → assertion on names + count (I-6/I-8), not just "no throw"

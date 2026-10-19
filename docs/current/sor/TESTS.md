# Test inventory by task

No frozen test count: consult the runner for current measurements. The focused suites use synthetic images, in-memory filesystem fakes and happy-dom. Tests must exercise real logic (RULE 8).

- [Sheets and batch](tests/core.md)
- [Selection and pairing](tests/selection.md)
- [Generate SVG and AI-source image edits](tests/svg.md)
- [SVG to upload](tests/upload.md)
- [Shared log, secrets and gate tooling](tests/shared.md)

## Acceptance expectation

Must exist before the matching change ships:

* any new exported lib/batch function → a test that fails if it is deleted
* sheet/batch UI flows → component tests using `UI_SELECTORS.md` handles when first needed
* ZIP/folder export → assertion on names + count (I-6/I-8), not just "no throw"

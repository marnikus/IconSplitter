# Upload metadata acceptance

Part of [metadata generation and provider confirmation](upload-metadata.md).

## Automatic acceptance

Every complete generated response that passes the existing policy becomes
**accepted immediately**, for row and selected Generate/Regenerate as well as
Export selected. No second Accept click or confirmation is required. The runner
publishes/caches that accepted state once, retains any stored Creator/Copyright, logs one
acceptance and reports the actual accepted count, not the number of replies.
Reload restores accepted state without another paid call or acceptance prompt.

**Every field must be filled (2026-11-08).** Title, description, tags AND the
one-word Icon Name: if any is empty the metadata is NOT accepted (state
`invalid`, red message under the fields naming it, e.g. "Icon Name is empty …"),
for a generated answer, a remembered draft and a manual or bulk Accept alike
(`lib/upload/meta.validateUploadMetadata`; the stock tab keeps the shared
`validateMetadata`). The draft stays editable: fill the field, then Accept. A
saved prompt without a `Name:` line therefore yields invalid drafts until it
asks for the name (Reset prompt restores the default). A package already
exported before the Icon Name existed keeps its accepted state — a row that is
not accepted exports WITHOUT metadata — and shows a yellow warning instead.

Invalid/malformed/truncated results are never accepted as new metadata. Fixable
invalid text remains editable; failure/cancellation retains previous text/state.
Cancellation retains results already accepted but never starts chained exports.
A metadata-only run (Generate/Regenerate, row or selected) NEVER exports on its
own (2026-11-08): it stores the accepted text, and a row whose package holds
older text shows as stale until the user exports it. Only explicit Export
selected exports after its answers, using the run's own accepted states rather
than a stale React render. Old cached drafts
are not silently promoted, and manual edits still use local Accept below.
The initial exact-input provider confirmation remains mandatory.

## Accept metadata for the selection

The global **✓ Accept metadata (N)** button beside Generate/Regenerate accepts
existing metadata on checked icons only, including selected icons hidden by a
filter. N counts drafts, fixable invalid drafts and accepted-but-edited fields;
empty, pending/interrupted and unchanged accepted rows are excluded. The button
is disabled at zero and while a metadata/export run or other busy work is active.

It uses the SAME clean → validate → accept/cache/log gate as each row's Accept.
Valid metadata becomes accepted; invalid metadata stays unaccepted with its exact
validation errors. Empty/already accepted rows are skipped. The outcome line
reports accepted, invalid and skipped counts. There is no AI request, no new
metadata generation, and no additional paid confirmation.

Accepting unexported rows stores their metadata without creating files. Rows
with existing packages are re-embedded together through ONE export
batch, carrying the newly accepted states directly rather than waiting for a
React render. This prevents parallel per-row runs from skipping selected files.
Any stored Creator/Copyright survive, and edited accepted fields can be
accepted again. Acceptance persists in cache/export records through reload;
a sibling pair's shared-folder record cannot make an unchecked row accepted.


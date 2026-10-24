# Upload metadata acceptance

Part of [metadata generation and provider confirmation](upload-metadata.md).

## Automatic acceptance

Every complete generated response that passes the existing policy becomes
**accepted immediately**, for row and selected Generate/Regenerate as well as
Export selected. No second Accept click or confirmation is required. The runner
publishes/caches that accepted state once, retains Creator/Copyright, logs one
acceptance and reports the actual accepted count, not the number of replies.
Reload restores accepted state without another paid call or acceptance prompt.

Invalid/malformed/truncated results are never accepted as new metadata. Fixable
invalid text remains editable; failure/cancellation retains previous text/state.
Cancellation retains results already accepted but never starts chained exports.
A normally completed metadata-only run refreshes existing packages in one
sequential export batch, using the run's own accepted states rather than a stale
React render; unexported rows do not acquire unsolicited packages. Explicit
Export selected still exports the whole promised selection. Old cached drafts
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
with existing packages are re-embedded together through ONE sequential export
batch, carrying the newly accepted states directly rather than waiting for a
React render. This prevents parallel per-row runs from skipping selected files.
User-entered Creator/Copyright survive, and edited accepted fields can be
accepted again. Acceptance persists in cache/export records through reload;
a sibling pair's shared-folder record cannot make an unchecked row accepted.


# Image regeneration — automatic Apply and process progress

Current detail of [AI-source edits](svg-image-edits.md) and [I-71/I-72](invariants/svg-image-edits.md). [Handles](../selectors/svg-image-edits.md), [owners](owners/svg.md), [storage](storage/svg.md), [tests](tests/svg.md).

## Explicit automatic Apply

In the image-regeneration confirmation, **Regenerate images: apply automatically**
is unchecked by default. Checking it persists an explicit opt-in for future
runs. Only `on` enables the preference; missing, corrupt and unknown values keep
manual review. The prompt, exact input preview and initial **Generate now**
confirmation are still required before paid provider sends.

Checked: returned multi-icon grids are cropped and saved as new versions without
the Apply/Discard popup. Unchecked: the existing returned-square/named-crop review
remains. Single-icon results already save immediately under either choice.
The checkbox warns that moved/swapped artwork cannot be detected: auto Apply
accepts positional crops, not automatic identity recognition. Inspect results
later with the original and earlier image versions still available.

The choice is frozen into the confirmed run; later preference changes do not
change it or generate another request. Both policies use the same decoding,
square/grid validation, source-byte/root/pair checks, non-overwriting version
allocation, verified sidecar writes, main-image update and usage/journal rules.
A stale cell is skipped with a failure, never applied to another pair; valid
cells can still save. Unknown provider outcomes are never auto-retried.

## Independent Batch-style image bar

Single-image and composite runs share an image-only process bar above the tabs.
It remains visible while Generate SVG is parked/hidden and does not replace or
cancel concurrent SVG process progress. The bar shows request position,
processed/total, remaining, percentage and separate saved/failed/discarded counts.
Processed includes failed or discarded cells, not just successful saved versions.
Counts advance after actual cell outcomes; waiting for a provider does not invent
progress. Manual review explicitly says waiting for Apply/Discard; committing
cells says saving new versions.

**Stop image run** prevents unsent requests. Already-sent responses still finish
under the original manual or automatic Apply policy. The bar says stopping while
waiting, then stopped with truthful partial counts/percentage, never fake 100%.
Failures/incomplete work say check results. A completed/stopped bar remains until
Dismiss; a new process restores it. Progress is session-only, never restored as
paid work after reload. The existing once-per-finished-process completion sound
and cancellation silence still apply.

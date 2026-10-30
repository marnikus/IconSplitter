# Getty ESP upload progress must reflect per-file readiness (2026-10-30)

## Request and evidence

The reported ESP batch is `68582498` (seven icons). The supplied Getty page capture shows seven cards: five display Getty's **Ready to submit** status, while two display **Upload failed** and the `BlockIcon` / `data-cy="not-ready-icon"` state. In the accompanying IconSplitter capture the batch-level progress reports all seven as completed (14 files / 14), despite those two failures. The page evidence also shows the last card (`icon-map-pin_6_03_v4.eps`, contribution ID `2302700733`) still not ready. The user reports that this file was not resubmitted later after its status did not change.

This document records the code-path analysis and corrective design. Per request, this change is documentation only: no application code or tests were changed here.

## Findings in the current implementation

The relevant flow is `src/stockupload/runupload.ts` → `src/stockupload/gettywebtransfer.ts` → `src/lib/stockupload/gettyprogress.ts` and the Getty browser helper (`tools/`).

1. `liveGettyProgress()` currently sets bar `done` to `base + settledFiles(progress)`.
2. `settledFiles()` in `gettywebtransfer.ts` returns `max(uploaded, ready) + failed`. This mixes two distinct milestones: bytes/files transferred (`uploaded`) and Getty's actual ready-to-submit state (`ready`). An item can therefore advance the completed counter before metadata processing has made it ready.
3. The live counter is clamped to the overall planned task count. A pair is not a single file: the plan can contain EPS and JPEG transfers, while the visible ESP contribution status is per icon/pair. Consequently, merely comparing the two raw counts can still misrepresent the number of ready contributions.
4. The final icon outcomes are better guarded: `outcomeOf()` only treats an accepted name as success if Getty did not list a matching rejection, and otherwise requires an accepted/ready signal. However, the live progress and batch completion display are separate from these outcomes; a positive transfer count can look fully successful while final contribution readiness remains false.
5. `finishGettyWebRun()` is invoked only if at least one icon was accepted. It makes a final probe, and the caller may show `ready`/`submitted`. This does not retry a failed or still-not-ready icon. An unchanged not-ready status must not be silently interpreted as a success or as a reason to resend automatically.
6. The progress reader permits `ready` to be omitted/zero and the UI's `settledFiles()` treats missing readiness as a reason to fall back to `uploaded`. That fallback is the central semantic error: unknown/not-yet-ready is not complete.

The code's existing intended invariant is already expressed in comments: Getty's **Ready to submit** marker is the proof of a successful contribution. Progress must follow that invariant consistently, not just the final per-icon result.

## Correct status model

Represent these as separate measures, never one overloaded `done` count:

- **Transferred**: the browser completed sending file bytes. Informational only; not contribution success.
- **Failed**: Getty explicitly displays `Upload failed`, or a transfer/validation failed.
- **Ready**: Getty currently displays `Ready to submit` for the contribution. This is the only per-contribution success count before actual submission.
- **Submitted**: Getty confirms that the batch was submitted, if that page/workflow exposes a submission action.
- **Unresolved**: neither a failure nor a positive ready signal has been observed. This includes stale status, page refresh, missing card, polling timeout, and status not changing.

For the user's seven-icon example, the status should read **5 ready, 2 failed** (or **5/7 ready; 2 failed**)—never **7/7 complete**. If a pair contains two uploadable files, the UI may additionally show file transfer progress (for example, `12/14 files transferred`), but it must label it as transfer progress and must not present that count as icon completion.

## Recommended fix

1. **Separate progress dimensions in the model and UI.** Replace the ambiguous Getty `done` update with explicit counts (e.g. `transferredFiles`, `readyIcons`, `failedIcons`, `totalIcons`, and phase). Keep the generic cross-target batch bar's `done` semantics for genuinely completed tasks, but do not feed it raw Getty uploaded-file counts. If the existing shared bar cannot express two dimensions, show a dedicated Getty detail/status line and advance its completion value only from ready + terminal failed outcomes; keep failures visibly failed rather than green success.
2. **Make readiness the sole success signal.** Remove the `max(uploaded, ready)` fallback in `settledFiles()`. Do not count `uploaded` as done. Treat a Getty explicit failure as terminal failure; treat all absent/unknown statuses as unresolved. Ensure pair aggregation waits for every required paired file/status, rather than assuming one filename proves the whole icon.
3. **Reconcile final UI against per-icon outcomes.** At request completion, derive the summary from the final accepted/rejected/ready results, not the last progress poll. Preserve failures and unresolved items in the completed run record; the overall run can be finished while explicitly reporting partial failure. Do not paint the whole run green merely because HTTP transfer/automation completed.
4. **Do not auto-resubmit unchanged or ambiguous items.** A poll that sees the same `not_ready_to_submit` state is not an instruction to retry. Offer an explicit retry action only for confirmed failed items, after re-reading/revalidating the current Getty card and checking that a duplicate contribution is not already present. For unresolved items, offer refresh/recheck and report the reason; require user confirmation before any resend. Persist the per-file/per-icon attempt and latest observed state so a rerun cannot silently duplicate an upload.
5. **Handle progress freshness and terminal states.** Include a timestamp/sequence or monotonic counters in helper progress. Ignore stale regressions; after terminal phase, reconcile once against the live page before deciding readiness. If the helper/page disappears or polling times out, keep items unresolved—never infer success from the transfer count.
6. **Fix the output language.** Use “transferred” for bytes accepted, “ready to submit” only for Getty's explicit ready status, and “submitted” only after confirmed submission. Do not label the complete run “successful” if it contains failed or unresolved contributions.

## Regression coverage to add with the implementation

- A seven-icon run where five become ready and two report `Upload failed`: progress and final summary show 5 ready / 2 failed, not 7/7 success.
- All bytes transferred but `ready` is zero or missing: ready count remains zero and the items remain unresolved.
- `uploaded` reaches the file total before metadata-save phase: no contribution-completion increase.
- One EPS/JPEG pair with only one ready file/card: the icon is not counted ready until Getty confirms the contribution-level state required by the workflow.
- A final contribution still has `not_ready_to_submit`: no implicit resend on completion, reload, polling timeout, or subsequent run initialization.
- Explicit retry of a confirmed failed item is user-triggered, scoped to that item, and recorded; unchanged/unknown statuses cannot invoke it.
- Stale progress after a newer ready result cannot move readiness backwards or incorrectly finish the batch.
- Fully ready batch and confirmed submitted batch retain distinct wording/status.

## Scope and confidence

The screenshot/DOM provided by the user is direct evidence of the discrepancy in batch 68582498. The repository inspection identifies the precise semantic mismatch in the current progress calculation (`max(uploaded, ready) + failed`) and a likely contributing factor: file-level transport counters are mixed with contribution-level readiness. The screenshot alone cannot establish why Getty did not update the last contribution or whether a transient page/automation error occurred. The safe fix is therefore to preserve it as unresolved and require a fresh status check before any explicit retry, rather than infer success or replay the upload.

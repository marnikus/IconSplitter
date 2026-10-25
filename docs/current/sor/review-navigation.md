# Review auto-next — nearest pending row below

After a **one-row Approve or Decline**, the active row advances to the **closest pending row strictly below the reviewed row in the displayed list**. This is shared by Selection V2 (list and comparison), Batch folders and Generate SVG through `src/lib/reviewselect.ts::nextPendingBelow`.

## Order and boundaries

- Capture the visible, filtered, sorted order **before** the decision. Approval can remove the current row from a pending-only filter or move it under a status sort; neither may change the reference position used by auto-next. Generate SVG uses its displayed **pinned** order, not a fresh sort or source scan.
- Starting immediately below the reviewed row, skip rows whose review status is not `pending`. Never consult raw filesystem/scan order, select a hidden row or wrap to a pending row above.
- If no pending row exists below, leave the active ID unchanged. The decided row may be hidden by a status filter; this does not justify jumping upward. An absent/hidden reference, empty list or completed list likewise does not advance.
- Generate SVG only advances to pending items with a generated SVG, matching its existing review eligibility. `needs-review` is its own status, not `pending`. A candidate reviewed while the asynchronous save was pending is skipped using live metadata. A save finishing after the user changes active row must not steal the new active row.

## Controls and unaffected actions

Selection's **Next pending after a decision** checkbox remains the opt-out, in both layouts. Batch and Generate SVG apply the same downward rule to one-row review buttons and A/D shortcuts. No additional history entry is created just for auto-next.

Auto-next changes **active only**, never checked IDs or the Shift anchor. Manual row clicks, arrow navigation, Q/E, checkbox/modifier/header gestures, existing eligibility/paid confirmations, persistence/retry, review history and completion sounds retain their contracts. Multi-row decisions and reset/warning/needs-review actions do not auto-advance.

SVG to upload consumes already-approved SVGs and offers no approve/pending row-review workflow; the single-sheet editor also has no row approval. Their manual selection is unaffected. This rule is about post-decision auto-next, not a new pending-only restriction on ordinary selection.

## Owners and regressions

- Selection: `src/selection/{state,useSelection}.ts`; `tests/{selection_state.test.ts,selectionv2_ui.test.tsx}`.
- Batch: `src/batch/useBatchView.ts`; `tests/batch_ui.test.tsx`.
- SVG: `src/svg/reviewact.ts`; `tests/{svg_ui.test.tsx,svg_review_item.test.ts}`.
- Shared pure ordering/boundaries: `tests/reviewselect.test.ts`.

See [shared selection invariant I-73](invariants/shared.md#i-73) and [RULE 25](../rules/BEHAVIOR.md#rule-25) for manual selection, checked scope and undo guarantees.

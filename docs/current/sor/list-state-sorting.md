# Review-list state sorting

Applies to Batch, Selection V2, Generate SVG and SVG to upload. Single sheets has
no checkable review list and is unchanged. These are **sorts, not filters**: no
rows disappear, checks do not change, and active/anchor remain independent.

## Group definitions and reversal

- **Selected** means the canonical checkbox state, never the active highlight.
  Batch uses case-insensitive root-relative paths, Selection V2 pair ids, and
  SVG/Upload source ids. Hidden checks stay checked but cannot create visible rows.
  Batch's legacy processing `row.selected` mirror is not the sort's source of truth.
- **Approved** means `review === approved` for Batch/Generate SVG and
  `decision === approved` for Selection V2. Pending, absent, declined, warning
  and needs-review states all belong to **not approved**; this differs from the
  existing multi-state review/status ranking sorts.
- In **SVG to upload only**, approved means **metadata state accepted**. Generated,
  empty, pending, invalid and interrupted metadata are not accepted. Exported/
  processed status and source SVG approval do not decide this group; all listed
  source artwork is already approved by discovery.

Batch and Selection V2 add **Selection** and **Approval** to Sort by. Their existing
Order selector says **Not selected first / Selected first** or
**Not approved first / Approved first** (`asc` / `desc`), including in history.
Generate SVG and Upload add four explicit Sort by options: **Selected first**,
**Not selected first**, **Not approved first**, **Approved first** (`selected`,
`unselected`, `unapproved`, `approved`). Existing sorts/defaults are preserved.

Ties use existing ascending path/name order (including its id fallback where
present), independent of group direction. Sorting copies arrays; it never rewrites sidecars, versions,
metadata, source files or selection. Batch/Selection stored sort parsing accepts
the new keys and still rejects unknown values. Existing persistence/history
policies remain, with no new storage schema.

## Live updates, navigation and performance

Explicit state sorts regroup as checks/approval change, including undo/redo.
Generate SVG bypasses its normal pin **only for the four new state sorts**;
normal generation/date/name/status/cost sorts keep the existing pinned behavior.
Selection's auto-next computes the same pre-decision checked order the panel
showed; closest pending below/no wrapping remains [review navigation](review-navigation.md).

Checked ids are indexed once per sort, not searched per comparator. Selection
subscriptions and visible memo dependencies include checks **only while sorting
by selection**. Ordinary sorts retain memoized list identities and
[large-list selection projection](selection-performance.md), rather than doing
sort/preview work on each checkbox change. No extra file reads/provider requests,
selection mutations, hidden controls, virtualized rows or deferred updates.

## Source and test owners

`lib/statesort.ts` owns binary stable grouping, sort predicates/menu values and
two-control direction labels. Existing `batchsort`, `reviewsort`, `svglist` and
`upload/rowlist` retain tab semantics and tie ordering. `state/useSortChecks.ts`
subscribes Batch/Selection to checks only when required. Their view hooks and
SVG/Upload derived views pass canonical checks into the pure sorts.

- `tests/list_state_sort.test.ts`: both directions in all four sorts, mixed
  non-approved states, hidden/case-insensitive checks, canonical versus legacy
  state, accepted metadata versus processed/source-approved, input immutability,
  stored parse/rejection and honest history labels.
- `batch_selection_v2`, `selectionv2_ui`, `svg_ui`, `upload_ui`: real-panel sorting,
  live check and approval transitions, both directions, preserved checks, Batch
  undo and Selection's pre-decision next-pending order. Upload uses an explicitly
  confirmed fake transport and verifies one send; no live provider is called.
- Existing sort, rowmodel, SVG pin, selection-response and native performance
  suites retain their original assertions/budgets.

[Plan and verification](../../archive/2026-10-26-list-state-sorting/README.md).

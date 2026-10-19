# UI Selector Reference — compatibility letter index

The selector descriptions now live in [task-specific pages](README.md). This
page preserves the A–S heading anchors for existing links. Start with the
owning tab page; the [shared page](selectors/shared.md) owns app shell, global
activity log, history, and selector conventions. Per RULE 21, prefer
**semantic** (role / label / text) > **structural** > **class fragment**
(Tailwind utilities are a last resort, never primary).

## A. File input — primary entry point

[Single sheets](selectors/sheets.md#a-file-input--primary-entry-point).

## B. Upload triggers

[Single sheets](selectors/sheets.md#b-upload-triggers).

## C. Export controls — header

[Single sheets](selectors/sheets.md#c-export-controls--header).

## D. Sheets panel

[Single sheets](selectors/sheets.md#d-sheets-panel).

## E. Export settings panel

[Single sheets](selectors/sheets.md#e-export-settings-panel).

## F. Detection panel (active sheet only)

[Single sheets](selectors/sheets.md#f-detection-panel-active-sheet-only).

## G. Boundary overlay — include/exclude

[Single sheets](selectors/sheets.md#g-boundary-overlay--includeexclude).

## H. Status surfaces

[Single sheets](selectors/sheets.md#h-status-surfaces).

## I. Selector object structure — for every element

[Shared conventions](selectors/shared.md#i-selector-object-structure--for-every-element).

## J. Handles still needed (to be added on demand)

[Shared discovery list](selectors/shared.md#j-handles-still-needed-to-be-added-on-demand) identifies unimplemented sheets/batch handles; do not assume they exist in the DOM.

## K. Workbench tabs — mode switch

[Shared Workbench](selectors/shared.md#k-workbench-tabs--mode-switch).

## L. Batch panel — `src/batch/*`

[Batch folders](selectors/batch.md#l-batch-panel--srcbatch).

## M. Selection review — `src/selection/*` (verified 2026-10-01)

[Selection](selectors/selection.md#m-selection-review--srcselection-verified-2026-10-01).

## N. Selection review V2 — `src/selectionv2/*` (verified 2026-10-01)

[Selection V2](selectors/selection.md#n-selection-review-v2--srcselectionv2-verified-2026-10-01).

## O. Global history bar, reset actions (verified 2026-10-01)

[Shared global history](selectors/shared.md#o-global-history-bar-reset-actions-verified-2026-10-01); [Selection reset/row interactions](selectors/selection.md#selection-reset-and-row-interactions).

## P. Generate SVG — `src/svg/*` (verified 2026-10-01)

[SVG generation](selectors/svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01); [AI-source image edits and provider consent](selectors/svg-image-edits.md).

## Q. App shell and the global activity log (verified 2026-10-05)

[Shared shell and log](selectors/shared.md#q-app-shell-and-the-global-activity-log-verified-2026-10-05).

## R. SVG to upload — `src/upload/*` (verified 2026-10-07)

[SVG to upload](selectors/upload.md#r-svg-to-upload--srcupload-verified-2026-10-07).

## S1. Persistent progress header — `src/svg/SvgProgressHeader.tsx` (2026-10-11)

[SVG generation progress header](selectors/svg-generation-run.md#s1-persistent-progress-header--srcsvgsvgprogressheadertsx-2026-10-11), visible on every tab.

## S. Regenerate SVG — per-batch prompt in confirmation (2026-10-09 revised, `src/svg/SvgConfirm.tsx`)

[SVG regeneration confirmation](selectors/svg-generation-dialogs.md#s-regenerate-svg--per-batch-prompt-in-confirmation-2026-10-09-revised-srcsvgsvgconfirmtsx).

# Pinned bulk bar — the split controls stay reachable while scrolling

2026-10-16 · status: implemented same day (TDD: `tests/batch_pinned_bulkbar.test.tsx`).

## 1. The request

> (screenshot of the batch bulk bar) "this widjet should be added to pinned
> header as user scroll down."

The widget is `BatchBulkBar` (`.svg-bulk`, `batch-bulk`): selection counts,
review counts, Select/Deselect, zoom + thumb size, Preview/Regenerate splits,
review decision buttons and "Split approved". With 53+ rows the user scrolls it
away and loses the controls; it must pin to the top instead.

## 2. Scroll model (verified)

`.app-shell` is `overflow: hidden`; **`.app-main` is the scroll container**
(`overflow: auto`). The tab root `.batch-shell` has no overflow of its own, so a
`position: sticky; top: 0` element inside it pins against `.app-main` — no JS,
no scroll listeners (happy-dom fires none reliably; RULE: prefer CSS).

## 3. Why a wrapper is needed (the sticky-box constraint)

A sticky element only moves within its **parent's** box. Today the bar sits in
`.batch-controls-stack` — a box barely taller than the bar — so pinning the bar
there would do nothing. Fix: `BatchBulkBar` moves out of `BatchControls` into
its own wrapper `.batch-bulkbar-pin`, a direct child of `.batch-shell` (which
spans the whole list). Visual order is unchanged: source bar, filter grid,
**bulk bar**, presets/dest, merge bar, rows.

Stacking: `z-index: 6` — above row content (≤2), below the progress header
(55) and modals (30). `.svg-bulk` already paints an opaque `var(--v2-surface)`
background, so rows never show through the pinned bar.

## 4. TDD gates

1. CSS contract (repo precedent `layout_fullwidth` reads `index.css`):
   `.batch-bulkbar-pin` must declare `position: sticky` and `top: 0`.
2. DOM contract on the mounted Batch tab:
   - `[data-testid="batch-bulkbar-pin"]` wraps the bar (`batch-select-visible`);
   - the wrapper is NOT inside `.batch-controls-stack`;
   - DOM order preserved: after the source/filter controls, before the row list.

# AI-source image edits — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

These controls live in the Generate SVG tab. The shared connection switch, row selection, pair preview, toast, and status bar are documented in [Generate SVG](svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01); this page owns the image-edit-only controls and the provider consent/review flow (I-71/I-72).

## Image connection settings

The connection selector/name/kind/add/remove controls are [shared with SVG generation](svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01). `svg-image-settings` appears only for an image connection (`src/svg/SvgConnections.tsx`).

| Test id | Element | Notes |
|---|---|---|
| `svg-img-quality` / `svg-img-size` / `svg-img-w` / `svg-img-h` | image parameter grid | size presets + custom W×H (256..4096), shown only for image connections |
| `svg-img-n` / `svg-img-background` / `svg-img-format` / `svg-img-response` | image parameter grid | n 1..10, background, output format, response format |

## Image regeneration actions and row feedback

| Test id | Element | Notes |
|---|---|---|
| `svg-bulk-image-regen` | button | "◍ Regenerate image (N)" — N counts checked rows (2026-10-16); opens the AI source regeneration dialog for all of them; refuses honestly (toast, no dialog) while a TEXT connection is active; disabled at 0 and while an image batch runs (one at a time, 2026-10-19) |
| `svg-img-stop` | button | "■ Stop images (N left)" — shown only while an image batch runs (2026-10-19): no further image request is sent; the ones already sent finish and are saved; the outcome toast says how many were not sent |
| `svg-row-image-regen-{sourceId}` | button | "◍ Regenerate image" (2026-10-16; sits on its own line INSIDE the row's Generate / decision cell, after a `.svg-decision-sep` divider, with the same `svg-btn tiny primary` look as Regenerate, so the row keeps one grid cell per header column — 2026-10-19) — opens the SAME AI source regeneration dialog as the bulk action, for just this row; same guards (text connection, missing key, a scan in progress, a batch already running, an unreadable pair file — each refused with a toast); reads "◍ Regenerating…" and is disabled while this row's image is in flight |
| `svg-ai-bar-{sourceId}` | AI-source strip | INSIDE the pair cell, under the two previews (2026-10-19): the in-flight bar, the version chips and the last failure — present only when one of them has something to show. `contain: inline-size` keeps it from widening the preview column |
| `svg-ai-running-{sourceId}` | progressbar | shown while this row's AI image is being regenerated (2026-10-19); gone the moment its result lands |
| `svg-ai-error-{sourceId}` | note | "Last image attempt failed: {reason}" — shown while the pair file's LAST image entry failed (2026-10-19): the router's own message, a timeout or a refused write; `title` = the full reason |
| `svg-ai-chip-{sourceId}-orig` / `svg-ai-chip-{sourceId}-{n}` | version chips | the AI source's version bar (2026-10-16): the original image plus every recorded regeneration with status "done"; the main one carries class `primary` and `data-active="true"`; clicking a chip makes that version main (persisted to the pair file) — the AI thumbnail switches to it everywhere |

## Image-edit confirmation, preview, and review

Opening the dialog sends nothing. Only an explicitly confirmed provider request transmits the disclosed prompt and current main images; Stop prevents unsent requests. A returned multi-icon mosaic must be reviewed before saving independent versions.

| Test id | Element | Notes |
|---|---|---|
| `svg-img-confirm` | dialog backdrop | AI source regeneration dialog: confirm-before-send, titled "Regenerate AI source image"; `.svg-backdrop` around `section.svg-modal.img-regen[role=dialog][aria-modal=true]`; `svg-img-cancel` / Escape sends nothing; `svg-img-generate` is disabled for a blank prompt, invalid size/count or an unprepared multi-icon preview. A prepared preview Blob is the exact multipart image sent, never rebuilt after confirmation (I-72) |
| `svg-img-wait` | fact | "N s per image" for a single source, "N s per request" for an image-edit composite; at least the 300 s image floor |
| `svg-img-count` / `svg-img-provider` | facts | the selected count and the active IMAGE connection as `{conn.name} · {kind label}` (`title` = the raw model id); opening it with a text connection active is refused before the dialog exists |
| `svg-img-caps` | note | Single: prompt + current main image per request, result saved as new main. Multi: one explicitly previewed square of up to the chosen number of current main images per request; response must be reviewed before saving separate per-pair versions. No original is overwritten |
| `svg-img-per-request` / `svg-img-count-error` | input / alert | image-edit-only positive integer preference (default 4, 1–16, further limited by square output size at ≥256 px/cell); invalid count/output setting disables Generate and is named, never silently clamped; a corrupt stored preference resets with one warning |
| `svg-img-preview-loading` / `svg-img-preview-error` / `svg-img-skipped` | states | the exact local composite is being prepared; a group that cannot be read/decoded is not sent, with named reason, while other valid groups remain available |
| `svg-img-composite` / `svg-img-manifest` / `svg-img-effective-prompt` | preview | per-request square preview with numbered row-major filenames (relative path when names collide), blank-cell count, provider and **full** thin-line/grid prompt; `svg-img-prev` / `svg-img-next` page valid requests |
| `svg-img-review` / `svg-img-apply` / `svg-img-discard` | returned-mosaic review dialog | returned mosaic beside proposed named cell crops; only Apply saves independent versions and changes each pair's main image; Discard changes no version and cannot refund a sent request |
| `svg-img-preset` / `svg-img-prompt` | preset / editor | the SAME preset dropdown and prompt editor as SVG generation (the shared `PromptBlock`): picking a preset fills the editor with its text; the editor content is the prompt every request sends |

## Image-edit interruption and status

`svg-img-inflight` is the separate image-edit sent/unknown or lost-review notice (provider may have charged); `svg-img-inflight-retry` opens a NEW confirmation, never sends automatically; `svg-img-inflight-dismiss` forgets that record, and `svg-img-journal-warning` names a corrupt stored journal. `svg-busy` also says "Regenerating AI sources · done/total" while an image batch runs, advancing per landed result (2026-10-19). The [shared SVG toast and status surfaces](svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01) report the outcome.

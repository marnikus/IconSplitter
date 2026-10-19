# Docs — Icon Splitter

Doc map. Rule 17 (AGENT_RULES) governs this layout: one current doc set, dated
archive. Archive rows are **one-line pointers** (hygiene item O11 of
`archive/2026-10-07-env-setup-performance/design.md`) — the detail lives in the
doc itself, never in this map.

## Current (true today)

| File | What it is |
|---|---|
| [`current/AGENT_RULES.md`](current/AGENT_RULES.md) | Code-quality rules every change MUST follow (24 rules, stable numbers) |
| [`current/SYSTEM_OF_RECORD.md`](current/SYSTEM_OF_RECORD.md) | Current behaviour, state model, invariants (`I-<n>`), flows, UI inventory — read by section, index at its top |
| [`current/CODE_VERIFICATION.md`](current/CODE_VERIFICATION.md) | What to run before every commit (`verify:fast`) and push (`verify`), ratchet, overrides, optional browser probes |
| [`current/UI_SELECTORS.md`](current/UI_SELECTORS.md) | Living `data-testid` / semantic handle reference for tests |
| [`current/QUALITY_RECHECK.md`](current/QUALITY_RECHECK.md) | Append-only dated re-check ledger — append an entry, never read it into context |

## Historical

| Folder | What it records |
|---|---|
| `archive/2026-10-01-batch-processing/design.md` | Batch folders: module map, browser constraints, negative tests |
| `archive/2026-10-01-history-session/design.md` | Shared app-state store above the tabs, the single global undo timeline (RULE 12), session restore snapshot |
| `archive/2026-10-01-selection-review/design.md` | Selection V1: pairing model, atomic decision protocol, hotkeys, a11y |
| `archive/2026-10-01-selection-v2/design.md` | Selection V2: template-driven list review, zoom, selection vs decision state, bulk scope |
| `archive/2026-10-01-generate-svg/design.md` | Generate SVG: approved-only discovery, contact-sheet batching, validation, pair-file versioning |
| `archive/2026-10-01-svg-batches-limits-preview/design.md` | Generate SVG fixes: one request per batch + paginated confirmation, tier caps/timeouts (reversed 2026-10-05), per-request outcomes, one zoom value |
| `archive/2026-10-01-svg-preview-cost/design.md` | Preview background (preview-only frame + contrast rule) and per-version cost (basis + pricing version) |
| `archive/2026-10-01-svg-preview-rendering/design.md` | SVG preview: root cause of "copies but paints nothing", the sanitize/fit/inline pipeline, id scoping |
| `archive/2026-10-05-per-pair-metadata/design.md` | One JSON per pair: approval + SVG history beside the images, read-only legacy fallback (I-41…I-43) |
| `archive/2026-10-05-recursive-scan-determinism/design.md` | Scan determinism: canonical order, order-independent pairing, per-file problem statuses, read-only scans, one ticket one commit |
| `archive/2026-10-05-folder-path-copy/design.md` | Copy a folder not a file; the picked root's real full path captured once and remembered (`iconSplitter.rootpaths.v1`) |
| `archive/2026-10-05-global-log/design.md` | Global activity log: one docked panel for every tab, entry exclusions, and the dock layout fix (`--app-dock-h`) |
| `archive/2026-10-05-folder-bar/design.md` | One folder control, one path row (I-44…I-46); removal of the `Use copied path` field and the 30 s Watcher |
| `archive/2026-10-05-root-path-at-pick/design.md` | Why no web page can read the picked folder's real path, and the pick-time clipboard capture that fills the gap (I-35) |
| `archive/2026-10-05-svg-source-list-audit/design.md` | Generate SVG list built from files not decisions: one row per normalized AI path, exclusions with reasons, the audit line |
| `archive/2026-10-05-split-scope-and-path-guard/design.md` | The reviewable set is the batch's `_*split*output` tree; `isFolderPathText` guards the raw clipboard/button/field text |
| `archive/2026-10-05-picked-output-root/design.md` | Picking the batch's own output: `ScopeRule { split, hideOutside }` (I-47), batch folder found from either side (I-48) |
| `archive/2026-10-05-root-independent-pairs/design.md` | A file is read from where it sits (I-49), run stamps are evidence (I-50), paths derive only from named folders (I-51) |
| `archive/2026-10-05-path-capture-recovery/design.md` | When the first path capture fails: Rescan retry, Ctrl+V adoption, honest reasons, no invented path (I-52) |
| `archive/2026-10-05-queue-variants-zoom/design.md` | Generation queue, additive `preferred` version key, one shared 48–800 px zoom (I-53…I-55) |
| `archive/2026-10-05-svg-long-requests/design.md` | Long generations: SSE streaming + keepalives, the stall window instead of total timeouts, journal + restart recovery |
| `archive/2026-10-06-location-folder-of-file/design.md` | "Location" names the folder of the FILE (I-56); `targetPathOf(row)` as the single-file rule |
| `archive/2026-10-06-svg-to-upload/design.md` | SVG to upload: the phase-0 research record — reuse map over `src/svg/*`, the package contract, what was built new |
| `archive/2026-10-07-svg-to-upload/design.md` | SVG to upload (design of record): discovery through the pair sidecars, settings, the Gemini metadata prompt, SVG/JPEG/EPS pipelines, per-icon `export.json`, job model, no automatic uploading |
| `archive/2026-10-07-svg-to-upload-merge/ADR.md` | The three-branch "SVG to upload" merge: P0 adjudications before any donor file moved, the phase plan and its exit gates |
| `archive/2026-10-07-env-setup-performance/design.md` | Environment-setup performance: re-verified findings, the O1–O11 decisions (O4 deferred), TDD plan for `tools/verify.mjs` + shallow-safe `quality.mjs` |
| `archive/2026-10-08-title-one-phrase/design.md` | One-phrase titles (parallel session, superseded the same day by `one-clean-phrase` below): the review's two-sentence/period finding, cutting a second sentence, the four gates a title enters (the committed record included) |
| `archive/2026-10-08-stock-clean-svg/design.md` | Stock-clean export SVG: the review's findings measured against the code, decisions D1–D7 (namespaces once on the root, 10 % tidy stroke widths, no root px size, titles without trailing period, `transparent` background, stroke colour setting), size budget and the 14-step TDD plan |
| `archive/2026-10-08-stroke-width-exact/design.md` | Exact stroke width: why `2` became `2.6224000000000003` (width finalised before SVGO baked the transforms; pt vs px), decisions D1–D8 (bake every transform into the geometry in prepare, then write the px setting verbatim; one outline model shared with the EPS writer; named refusals), size budget, 8-step TDD plan |
| `archive/2026-10-08-one-clean-phrase/design.md` | Metadata title and description: ONE clean phrase each — first sentence only (REVISED the same day: every sentence is kept, only the final period goes — see the SOR), sentence case, no end punctuation — at parse, cache read and Accept; prompt and hints ask for it |
| `archive/2026-10-09-eps-executable-artboard-megapixels/design.md` | Shipped 2026-10-09 in three commits (A/B/C): the built-in EPS as an executable program (`[…] concat`, fill-then-stroke, a subset stack checker in the gate), the artboard measured from the artwork AS IT SHIPS (strokes/expansion included, the artboard rect always present, a clone-bake-measure loop for verbatim strokes under a scale), and "Scale to N MP" (default 5, content mode) — decisions D1–D6, owner files, 14 TDD steps in three commits, I-60…I-62, open points Q1–Q3 |
| `archive/2026-10-09-root-path-glued-folders/design.md` | Fix (I-59, two rounds): the `Full path` row that glued the previous root's export folder onto a new pick — round 2 (§5) removed the "parent + name" completion entirely (exact leaf or nothing), a stored `completed` guess reads as no path, derivation starts only from an exact capture, and a late capture (Rescan / Ctrl+V) names the known handle |
| `archive/2026-10-09-root-path-identity/DESIGN.md` | Fix (I-63, third report after I-59 failed twice): a full path is bound to the picked folder's HANDLE, never its name — the name-keyed store was the root cause of the recurring glued path and the false "full path not captured"; handle-keyed IDB records, one-level-up/down adoption + derivation both ways from `resolve()`, v1 key never read |
| `archive/2026-10-09-regenerate-from-svg/design.md` | Regenerate SVG: feature 1 (full main prompt + first image, locked by tests) and "Regenerate from current SVG" (saved SVG prompt + current SVG code + the same image, one icon per request — I-64), its window above the prompt window (moved from Export settings the same day), and the shared prompt window + preset bar (I-65) |
| `archive/2026-10-09-eps-converters-inkscape-expand/design.md` | DESIGN (no code yet): EPS converter drop list (registry: built-in + Inkscape CLI), the local Inkscape helper (`tools/bridge/`, 127.0.0.1), and "Expand strokes to fills" (built-in cubic offsetting in `geom/expand/`) — decisions D1–D5, owner files, 16 TDD steps, open questions Q1–Q5 |
| `archive/2026-10-09-export-metadata-readback/design.md` | Missing-metadata fix: matching fingerprints no longer bless metadata-free existing outputs; exact accepted metadata readback repairs SVG/requested EPS only and leaves JPEG untouched |
| `archive/2026-10-09-upload-regenerate-metadata/design.md` | Bulk metadata regeneration: selection-only, non-null metadata filter, explicit replacement confirmation, and separate Generate action |
| `archive/2026-10-09-svg-bulk-regenerate/design.md` | Generate SVG bulk Regenerate: selection-only, valid-existing-SVG filter, separate Generate action, shared confirmation and queue |
| `archive/2026-10-08-eps-rounded-rect/design.md` | SVG to upload — EPS: a rounded `<rect>` is written as an exact outline (four lines, four KAPPA arcs) and the fix is reported on the row/log/toast, never asked; the rotated-rounded-rect bake refusal is gone |
| `archive/2026-10-08-upload-download-all/design.md` | SVG to upload — "Download all": the selection's committed SVG/JPG/EPS copied into one user-picked folder (planner, never-overwrite, verified copy, one result line) |
| `archive/2026-10-08-svg-queue-keepalive/design.md` | Design (implemented the same day — I-53 rewrite, I-57, I-58): Generate SVG — the panel kept mounted so a run and its queue survive a tab switch, a floating done/left popup on every tab, "Next attempt" grey row flag for queued sources, row Regenerate at the FRONT of the queue, the list order pinned and the run record moved below the list so a landing SVG never moves the page |
| `archive/2026-10-08-one-stroke-definition/design.md` | One stroke definition: `stroke` and `stroke-width` once on the root when the shapes agree (unstroked shapes say `none`), explicit per shape when they do not, never on a container; default stroke colour `#000000` |
| `archive/2026-10-09-regen-prompt-popup/design.md` | Regeneration prompt per batch in popup — first generation uses main prompt |
| `archive/2026-10-11-regenerated-review-status/design.md` | New review status: regenerated — yellow warning |
| `archive/2026-10-12-batch-active-row-select/README.md` | Fix Q/E to affect only active row, not all rows |
| `archive/2026-10-12-batch-nonblocking/README.md` | Batch non-blocking — folder search not blocked by split progress |
| `archive/2026-10-12-batch-v2-controls/README.md` | Batch folders — V2 controls: zoom, date filters, filtered multi-select |
| `archive/2026-10-12-batch-v2-selection/README.md` | Batch V2 selection + A/E shortcuts |
| `archive/2026-10-12-full-refactor-optimize/README.md` | Full refactor & optimize all new code — batch reuse, quality gates |
| `archive/2026-10-12-svg-upload-scroll-fix/README.md` | SVG to upload / Generate SVG blank areas and clipped list fix |
| `archive/2026-10-13-algo-efficiency/README.md` | Algo time process — 80% faster redesign (merged mask+downsample, fast count, rMax cap) |
| `archive/2026-10-13-algo-efficiency-v2/README.md` | Algo v2 — UF labeling, ink-cell limited extract, sampled hist, buffer reuse, early exit |
| `archive/2026-10-13-batch-flex-thumb-info/README.md` | Batch flex layout — file info under thumbnail, no fixed widths, full-width list |
| `archive/2026-10-13-batch-freeze/README.md` | Batch processing freezes UI — research & fix plan |
| `archive/2026-10-13-batch-freeze-v2/README.md` | Batch UI still freezes during progress — deep dive v2 |
| `archive/2026-10-13-batch-merge-preview/README.md` | Batch merge slider + Preview splits inline |
| `archive/2026-10-13-batch-preview-layout-fix/README.md` | Batch Preview layout fix — doc & plan |
| `archive/2026-10-13-batch-progress-bar/README.md` | Batch Split Selected — persistent progress bar same as Generate SVG |
| `archive/2026-10-13-batch-review/README.md` | Batch folders review — approve/decline/warning + 4-icon rule |
| `archive/2026-10-13-batch-row-merge-override/README.md` | Batch per-row merge override — design doc |
| `archive/2026-10-13-grid-split-failure/README.md` | Grid image fails to split — 2x2 lightbulb icons |
| `archive/2026-10-15-preview-restore-scroll-top/design.md` | Preview splits stored + restored after a restart, Regenerate rewrites, back-to-top button on all tabs |
| `archive/2026-10-19-image-regen-reference/README.md` | AI source regeneration sends the prompt AND the current main image as reference (`images/edits`); corrects the earlier "no edit endpoint" claim |
| `archive/2026-10-19-image-regen-spend-log/design.md` | AI source regeneration logs tokens in/out/total + cost per source and per run (`svg/imglog.ts`); "done" no longer counts failed requests |
| `archive/2026-10-15-preview-store-preset/research.md` | Research: previews lost on reload (boot permission gesture gap), per-item merge decisions not persisted — root causes RC1–RC4, rules I-66..I-68, fix plan |

Archived docs are dated by the day they were written and never edited afterwards.

## Outside `docs/`

| File | What it is |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | **Agent bootstrap — read first**: pinned environment, exact commands, per-task reading protocol, hard limits |
| [`../README.md`](../README.md) | User-facing: what the app does, install/run instructions (bat files, PyCharm) |
| [`../design/README.md`](../design/README.md) | UI handoff convention: the `SPEC.md` contract beside each design template |

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
| `archive/2026-10-08-stock-clean-svg/design.md` | Stock-clean export SVG: the review's findings measured against the code, decisions D1–D7 (namespaces once on the root, 10 % tidy stroke widths, no root px size, titles without trailing period, `transparent` background, stroke colour setting), size budget and the 14-step TDD plan |

Archived docs are dated by the day they were written and never edited afterwards.

## Outside `docs/`

| File | What it is |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | **Agent bootstrap — read first**: pinned environment, exact commands, per-task reading protocol, hard limits |
| [`../README.md`](../README.md) | User-facing: what the app does, install/run instructions (bat files, PyCharm) |
| [`../design/README.md`](../design/README.md) | UI handoff convention: the `SPEC.md` contract beside each design template |

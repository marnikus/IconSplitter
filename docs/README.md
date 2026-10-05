# Docs — Icon Splitter

Doc map. Rule 17 (AGENT_RULES) governs this layout: one current doc set, dated archive.

## Current (true today)

| File | What it is |
|---|---|
| [`current/AGENT_RULES.md`](current/AGENT_RULES.md) | Code-quality rules every change MUST follow (25 rules, stable numbers) |
| [`current/SYSTEM_OF_RECORD.md`](current/SYSTEM_OF_RECORD.md) | Current behaviour, state model, invariants, flows, UI inventory |
| [`current/CODE_VERIFICATION.md`](current/CODE_VERIFICATION.md) | What to run before every push (`npm run verify`), ratchet, overrides |
| [`current/UI_SELECTORS.md`](current/UI_SELECTORS.md) | Living `data-testid` / semantic handle reference for tests |
| [`current/QUALITY_RECHECK.md`](current/QUALITY_RECHECK.md) | Dated full quality re-check records (numbers + baseline decisions) |

## Historical

| Folder | What it records |
|---|---|
| `archive/2026-10-01-batch-processing/design.md` | Batch folders: module map, browser constraints, negative tests |
| `archive/2026-10-01-selection-review/design.md` | Selection V1: pairing model, atomic decision protocol, hotkeys, a11y |
| `archive/2026-10-01-selection-v2/design.md` | Selection V2: template-driven list review, zoom, selection vs decision state, bulk scope |
| `archive/2026-10-01-generate-svg/design.md` | Generate SVG: approved-only discovery, contact-sheet batching, validation, sidecar versioning |
| `archive/2026-10-01-svg-batches-limits-preview/design.md` | Generate SVG fixes: one request per batch with a paginated confirmation, reasoning-tier caps + timeout floors, per-request outcomes, one zoom value, layout-only preview stylesheet |
| `archive/2026-10-01-svg-preview-cost/design.md` | SVG preview background (preview-only frame + contrast rule) and per-version cost (basis + pricing version) |
| `archive/2026-10-01-svg-preview-rendering/design.md` | SVG preview: root cause of "copies but paints nothing", the sanitize/fit/inline pipeline, id scoping, rejected alternatives |
| `archive/2026-10-05-recursive-scan-determinism/design.md` | Recursive scan determinism: the filesystem's unspecified enumeration order reaching pairing (raster vs `.svg` for one pair id), approved pairs silently dropped into `missing`, a failed read laundered into `size 0`, a scan that wrote into the folder it scanned, overlapping scans letting the older snapshot win, and the fix — canonical order, order-independent pairing, per-file problem statuses, read-only scans, one ticket, one commit |
| `archive/2026-10-05-svg-long-requests/design.md` | Long SVG generations: the user's batch size at every tier (the 2026-10-01 caps reversed), SSE streaming + keepalives, the stall window instead of any total timeout, `stalled` as an unknown outcome, kept request ids, the in-flight journal + restart recovery, ticking elapsed + Cancel |
| `archive/2026-10-05-global-log-port/design.md` | The global log, designed on branch `arena/01a0f967-iconsplitter` (`694ceb3`) and ported here: what was carried over, the dock-overlay checkbox bug + the in-flow-spacer fix, the ten adaptations to the long-request runner. **Implemented 2026-10-05** — the contract as shipped is `current/SYSTEM_OF_RECORD.md` §13 |

Archived docs are dated by the day they were written and never edited afterwards.

## Outside `docs/`

| File | What it is |
|---|---|
| [`../README.md`](../README.md) | User-facing: what the app does, install/run instructions (bat files, PyCharm) |

# Docs — Icon Splitter

Doc map. Rule 17 (AGENT_RULES) governs this layout: one current doc set, dated archive.

## Current (true today)

| File | What it is |
|---|---|
| [`current/AGENT_RULES.md`](current/AGENT_RULES.md) | Code-quality rules every change MUST follow (24 rules, stable numbers) |
| [`current/SYSTEM_OF_RECORD.md`](current/SYSTEM_OF_RECORD.md) | Current behaviour, state model, invariants, flows, UI inventory |
| [`current/CODE_VERIFICATION.md`](current/CODE_VERIFICATION.md) | What to run before every push (`npm run verify`), ratchet, overrides |
| [`current/UI_SELECTORS.md`](current/UI_SELECTORS.md) | Living `data-testid` / semantic handle reference for tests |
| [`current/QUALITY_RECHECK.md`](current/QUALITY_RECHECK.md) | Dated full quality re-check records (numbers + baseline decisions) |

## Historical

| Folder | What it records |
|---|---|
| `archive/<YYYY-MM-DD>-<topic>/` | Designs, plans, root-cause notes — dated by day written, never edited afterwards |
| `archive/2026-10-01-batch-folders/` | `DESIGN.md` — recursive batch folders, review, presets, output tree (shipped 2026-10-01) |

## Outside `docs/`

| File | What it is |
|---|---|
| [`../README.md`](../README.md) | User-facing: what the app does, install/run instructions (bat files, PyCharm) |

# design/ — UI handoff templates

One folder per tab/template. A handoff is a **contract**, not raw HTML to
reverse-engineer (O7 in `docs/archive/2026-10-07-env-setup-performance/design.md`).

## What a handoff folder contains

| File | Role |
|---|---|
| `SPEC.md` | **the build contract** — written before implementation |
| `<name>.html` | visual reference only, never the source of truth |
| `<name>.png` | reference image |

Folders that predate this convention (`SVG tab generation/`, `selection tab
V2/`, `SVG to upload/`, `Arena setup analyze/`) keep their historical names
and contents; what they produced is documented in
`docs/current/SYSTEM_OF_RECORD.md` + `docs/current/UI_SELECTORS.md`.

## What SPEC.md must state — anything missing will be guessed

1. Purpose in one paragraph + which root/scope rules apply.
2. Sections top → bottom, with the exact copy strings.
3. Row/element anatomy.
4. Every state and its copy — an empty list is an honest empty result, never
   an error (RULE 4).
5. Actions, their gates and their failure texts (RULE 9 / RULE 15).
6. `data-testid` handles + the tab's prefix (RULE 21, `UI_SELECTORS.md`).
7. Persistence keys `iconSplitter.<area>.v<n>` + the validated shape (RULE 13).

## Rules

* New folders are named without spaces: `design/<tab>/`.
* After implementation the current truth is `SYSTEM_OF_RECORD.md` +
  `UI_SELECTORS.md`; a SPEC is never edited to catch up (RULE 17 in spirit —
  it is the dated handoff, not a live doc).

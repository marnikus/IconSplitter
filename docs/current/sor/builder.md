# SVG builder — current behaviour

Read this for the seventh tab. It composes presentation *sheets* from icons the app
already approved; it generates and changes nothing on disk except its own `builder/`
output folder. Plan and rejected alternatives:
[design/2026-11-07-svg-builder](../../archive/2026-11-07-svg-builder/design.md).
Handles: [selectors/builder](../selectors/builder.md). Storage keys:
[STORAGE](STORAGE.md). Tests: [TESTS](TESTS.md).

## Status

**Shell only (P0, 2026-11-07).** The tab exists, is registered, persists its session
slice and states honestly that scanning is not wired yet. The library, artboard,
controls, recipes, export and sheet metadata land in the phases listed in the design doc;
until each lands, its absence is said out loud, never shown as a dead control.

| Lands in | Surface |
|---|---|
| P1 | folder scan (approved icons), library rail, exclusions + audit |
| P2 | layout math and the live artboard |
| P3 | controls, presets, undo, persistence |
| P4 | selection recipes, locks, user presets |
| P5 | serializer, PNG, ZIP, `builder/` commit |
| P6 | sheet metadata (text-only request) |

## What exists now

* Tab `builder`, label **SVG builder**, between **SVG to upload** and **Upload**
  (`ui/Workbench`). Mounted lazily on first visit and then parked hidden, so a composed
  sheet survives a tab switch.
* The shared top menu (`builder/BuildSourceBar`): the one green **Open folder** button
  (I-44), **↻ Rescan**, the approved-only scope line, the one audit line, and the
  picked folder's complete path as read-only text (I-46).
* Two honest empty states: no File System Access API (`builder-unsupported`), and
  supported-but-nothing-picked (`builder-root-empty`).
* Session slice `builder` (`{ slots, locked, seed, recipe }`), validated field by field:
  a junk slot becomes a hole **in place** (cell position is the sheet's meaning), locks
  keep only ids that are placed, the seed is a positive integer, the recipe falls back
  per field (`lib/session`).

## Contracts this tab will keep (from the design)

* **Approved only.** The library lists exactly what SVG to upload would list (I-78);
  the builder adds its own `builder/` folder to the ignore list, so its exports never
  feed its own library.
* **Determinism.** Same pool + recipe + seed reproduces the same sheet; a preset plus
  the root reproduces it byte for byte.
* **No silent overflow.** A layout that does not fit says so and offers auto-fit.
* **Text-only metadata request.** The provider receives the effective prompt and the
  composed sheet's SVG source (or an announced digest over the cap) — never an image —
  and the prompt, parser, validator and failure policy are SVG to upload's, unchanged.
* **One undo timeline** (RULE 12) and the app's existing privacy rules (RULE 20).

## Storage

`iconSplitter.builder.*` keys and the `__builder__` root slot are listed in
[STORAGE](STORAGE.md); the Gemini key and provider config are **shared** with SVG to
upload rather than duplicated.

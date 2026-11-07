# SVG builder — current behaviour

Read this for the seventh tab. It composes presentation *sheets* from icons the app
already approved; it generates and changes nothing on disk except its own `builder/`
output folder. Plan and rejected alternatives:
[design/2026-11-07-svg-builder](../../archive/2026-11-07-svg-builder/design.md).
Handles: [selectors/builder](../selectors/builder.md). Storage keys:
[STORAGE](STORAGE.md). Tests: [TESTS](TESTS.md).

## Status

**Complete: shell through sheet metadata (P0–P6, 2026-11-07).** The tab is registered, persists
its session slice, reads the picked folder into an approved-icon rail, and draws the
sheet from that library. The artboard, controls,
recipes, export and sheet metadata land in the phases below; until each lands, its
absence is said out loud, never shown as a dead control.

| Lands in | Surface |
|---|---|
| ~~P1~~ done | folder scan (approved icons), library rail, exclusions + audit |
| ~~P2~~ done | layout math and the live artboard |
| ~~P3~~ done | controls, undo, persistence (presets land with P4) |
| P4 | selection recipes, locks, user presets |
| ~~P5~~ done | serializer, PNG, ZIP, `builder/` commit |
| ~~P6~~ done | sheet metadata (text-only request, shared prompt/validator/key) |
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
* **The library rail (P1)** — `builder/scan.ts` walks the whole selected root
  recursively through SVG to upload's own approved discovery (`upload/discovery`,
  given `ignore = ["export", "builder"]`), so this tab can never disagree about what
  "approved" means. One rail row per pair: the pair's own name, its folder, its
  version and the tags it can be searched by; `tagSource` records whether those tags
  came from generated metadata, the file name, or nowhere (Q6: a guess is never shown
  as metadata). Filters are folder chips plus one free-text box over name, folder and
  tags (`lib/builder/rows`, pure). A pair that is not listed is reported with the
  discovery's own reason, and the audit line says how many — a scan that read nothing
  usable never looks like a clean one.
* **Scan ordering** — one ticket per scan (`seq`): a slower earlier walk can never
  overwrite a newer one's icons. `__builder__` is this tab's own root slot, so it
  boots the folder it was pointed at, not another tab's.
* Session slice `builder` (`{ slots, locked, seed, recipe }`), validated field by field:
  a junk slot becomes a hole **in place** (cell position is the sheet's meaning), locks
  keep only ids that are placed, the seed is a positive integer, the recipe falls back
  per field (`lib/session`).

* **The artboard (P2)** — `lib/builder/layout.computeLayout` is pure arithmetic: the
  banner owns one side and the content rect is exactly the rest, the grid is fitted
  into the padded content and **centred**, the fit is 1 exactly when it fits, and a grid
  that cannot fit shrinks and says `overflow: true` with the percentage it had to use.
  Cell index is a position in the sheet, never a slot in a list. The screen scales the
  canvas for the viewport only — its own pixel size is the exported size, so what is
  drawn is what will be written.
* **What a cell may draw** — `lib/builder/place`: one root `<svg>`, no prolog, and the
  app's blocklist applied (scripts, event handlers and remote references are removed;
  `foreignObject` and a nested `<svg>` are refused with a reason). A refused icon shows
  the reason in its cell instead of an empty square that looks deliberate.
* **Placement in P2** is honest scaffolding: the first `capacity` icons fill the cells in
  scan order, artwork is read at most 4 at a time and sanitised once per icon, and a
  still-unread cell says so. P4 replaces only the slot source with the recipe engine.

* **The controls (P3)** — `lib/builder/config` is the ONE reader: a stored record,
  a control's change and an old history entry all pass through it, so a control can
  never hold a value the reader would refuse. Out of range → the nearest usable value;
  wrong type → that field's default; one junk field never costs the sheet.
  `iconSplitter.builder.config.v1` (via `builder/configstore`) and the session slice
  both carry it, and the session copy wins on boot.
* **Undo (P3)** — the builder adds exactly three entry kinds to the app's one
  timeline: `builderConfig`, `builderSelection`, `builderSeed`. `state/apply` clamps
  what it applies and refuses a seed of 0 or junk (0 would silently re-seed); a
  refused payload never moves the cursor. A control click and an undo therefore take
  the same path.

* **Export (P5)** — `lib/builder/serialize` writes ONE editable SVG: artboard pixels,
 every icon a nested `<svg>` in a `<g data-cell="n">` with its paths verbatim, the stroke
  declared **once**, captions as real `<text>`, byte-identical output, nothing scripted
  or remote. A sheet is validated by `validateSheet`, **not** `lib/svgvalidate`: that
  gate allows one `<svg>` because it judges a provider's answer, and a sheet nests one
  per icon by design (`tests/svg_extract.test.ts` pins the gate).
* **The commit** goes into `builder/` only and is **create-only** (`-1`, `-2`, …): an
  existing file is never overwritten, and the name cannot escape the folder. The walk
  already ignores `builder/`, so a sheet is never read back as an icon.
* **A partial export is reported as partial.** The SVG is the deliverable, the PNG and
  ZIP are conveniences; a canvas-less browser still gets the SVG, and the status line
  names what landed and why the rest did not. The PNG's real size is read back and
  compared with the artboard.

* **Metadata (P6)** — **no image** is sent (Q1): two text parts, the prompt and the
  sheet's SVG source. Prompt, parser, validator and tag rules are `lib/upload/meta`'s,
  imported (Q2); provider config and API key are the *same* stored ones upload uses.
* **Nothing is cut in half.** Over 60 000 characters the source is replaced by a
  structural digest, and the dialog states which mode is sent.
* **A lock is the user's claim on a cell** and is honoured in every placement path;
  a lock on an icon that left the library is dropped, never silently re-pointed at a
  different icon. A preset carries the design, the locks and the seed, so applying it
  brings back the same sheet; a slot whose icon is gone becomes a hole in place.
* **A record binds to a sheet's content**, not to its formatting: `sheetMetaFingerprint`
  hashes the grid, the banner words and the ordered icons, so re-serializing the same
  sheet never marks a record stale. A record that no longer matches is shown as stale,
  never as current, and is never silently re-sent.
* **The retry policy is one policy** (`lib/upload/retrypolicy`): only a
  provider-confirmed failure repeats; a timeout, a disconnect or a cancel is
  outcome-unknown, never auto-retried, and reported as such.

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

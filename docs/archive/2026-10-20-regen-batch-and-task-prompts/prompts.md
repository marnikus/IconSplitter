# Exact prompt text, copy and storage examples

Part of [the 2026-10-20 plan](design.md). Every string here is a contract: it is
what the popup previews, what the request carries and what the pair file records.

## 1. Batch regeneration prompt (pure: `lib/svgregen.regenBatchPrompt`)

Inputs: `presetText`, the request's ordered items (`position`, `name`), the
resolved code per item. Output:

```text
{presetText trimmed}

Here is a batch of {n} icons to regenerate, in numbered grid order:
1 — {name1}
2 — {name2}
…

Rules: Return exactly one complete SVG document for every position, in the same
numeric order starting from 1. Each SVG's <title> must be exactly the name of its
position, with no extra words and no file extension. Do not merge, move, swap,
add, remove or renumber icons. Use the attached grid only as the picture of the
same numbered icons: keep each icon's artwork, proportions and orientation, and
change only what the instructions above ask for. Return only the SVGs — no
commentary, no introduction, no explanations.

Current SVG code for position 1 ({name1}):
{code1}

Current SVG code for position 2 ({name2}):
{code2}
…
```

* `n` is the number of OCCUPIED positions of that request (a partial last
  request is `n = count`, never the grid's cell count).
* Codes are sent verbatim, trimmed, never truncated; a code that would exceed
  `REGN_CODE_MAX_CHARS` (20 000) is a named refusal before send.
* The whole text is refused when it exceeds `REGN_PROMPT_MAX_CHARS` (60 000).

### Recorded prompt (`record`, written into each pair file)

The pair file keeps a short, key-free description, never the codes (the code of
the previous version is that version's own file):

```text
{recordText} — regenerate in a batch of {n}, position {position}/{n}
```

where `recordText` is the preset text when it is shorter than 2 000 characters,
otherwise its first 2 000 characters plus `…`.

### Single-icon variant

Size 1 keeps the existing shape, wrapped by the same builder so there is one
source of truth:

```text
{presetText trimmed}

{manifest line 1 — name}

Rules: Return exactly one complete SVG document. Its <title> must be exactly
{name}…

Current SVG code for {name}:
{code}
```

The old `currentSvgPrompt(presetText, name, code)` remains exported for
compatibility and now delegates to this builder.

## 2. Generation prompt with a chosen preset

No new text: `singlePrompt` / `batchPrompt` (lib/svgprompt) already compose the
manifest, the order line and the "user prompt". The only change is the source of
that last part — the task's chosen preset text instead of `model.prompt`:

```text
Here is a batch of icons arranged in numbered grid order:
1 — {name1}
…

Create one SVG icon for every position. Return the SVGs in the same numeric
order, starting from 1. Use the exact same name in the SVG <title>.

{presetText or the stored main prompt}
```

The popup's full-prompt preview must show exactly this, so previewed == sent.

## 3. Copy strings (UI)

### Task labels and badges

| Task | Badge (`svg-confirm-task`) |
|---|---|
| `svg.generate.single` | `Generate SVG · single icon` |
| `svg.generate.batch` | `Generate SVG · batch ({n} icons)` |
| `svg.regenerate.single` | `Regenerate SVG · single icon` |
| `svg.regenerate.batch` | `Regenerate SVG · batch ({n} icons)` |
| `image.edit.single` | `AI source image · single icon` |
| `image.edit.batch` | `AI source image · batch ({n} icons)` |

The existing `svg-confirm-mode` badge stays and reads
`Generation batch now` / `Regeneration now`; the task badge sits next to it and
adds the shape.

### Default-prompt message (above the picker, `svg-confirm-prompt-default`)

| State | Text |
|---|---|
| main prompt | `Default prompt for this task — main prompt (currently loaded)` |
| saved preset | `Default prompt for this task — “{name}”` |
| preset gone | `Default prompt “{name}” is gone — using main prompt; pick another` |
| regenerate, no presets | `No saved prompts yet — save one in the prompt window above; regeneration needs one` |
| inactive tab | `{task label} — not used by this batch` |

### Select entries

* Generation / image tasks: `Main prompt (currently loaded)`, then one entry per
  saved preset (label = preset name).
* Regeneration tasks: only the saved presets, plus a disabled
  `— pick a saved prompt —` placeholder when the list is empty.

### Notes

* Regeneration: `Each request sends its {n} icons' current SVG code and this
  prompt, and its answer is matched back by SVG <title>.`
* Size 1: `Each request sends one icon's current SVG code and this prompt.`
* Generation with a preset: `This preset is used for this batch only — the main
  prompt in the prompt window is not changed.`
* Preset gone while a popup is open: the confirm button disables and the problem
  reads `The saved prompt “{name}” was deleted — pick another; nothing will be
  sent.`
* Size refusal: `A request with {n} icons would exceed the prompt limit —
  choose {m} icons per request or fewer.`
* Excluded row: `{name}: no readable current SVG — left out of this
  regeneration; use Generate selected for a first version.`

### Tab row (`svg-confirm-task-tabs`)

`Single icon` · `Batch` — the tab matching the current selection is selected and
cannot be deselected; the other tab is inspectable and editable and shows the
"not used by this batch" note.

## 4. Storage examples

`iconSplitter.svg.regenBatch.v1`

```json
{ "v": 1, "count": 4 }
```

`iconSplitter.svg.promptTasks.v1`

```json
{
  "v": 1,
  "tasks": {
    "svg.generate.batch": { "choice": "preset", "presetName": "Thin stroke" },
    "svg.regenerate.single": { "choice": "preset", "presetName": "Icon fixer" },
    "image.edit.batch": { "choice": "main" }
  }
}
```

Read rules (RULE 13): wrong `v`, non-object payload or an unreadable JSON costs
one ignored load and the defaults (all tasks = main / first preset). A task entry
that is not an object, has an unknown `choice`, an unknown task id, or a name
longer than 60 characters is dropped on its own. A `presetName` that no longer
exists in `iconSplitter.svg.prompts.v1` resolves to the fallback **and** is
reported by the picker (`stale`), never silently replaced on disk.

## 5. What must never be stored or logged

* No API key, no image bytes, no data URL, no full request payload, in the task
  store, in the progress strip, in the activity log or in the pair file
  (RULE 20). Codes are user content: the pair file records the SHORT record text
  above, never the sent codes of other icons in the same request.

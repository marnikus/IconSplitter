# Svg invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

**Detail pages:** [I-53/54/57/58 run & queue](svg-run.md) · [I-71/72 image edits](svg-image-edits.md).

<a id="i-17"></a>
* **I-17 (SVG preview, RULE 3/14):** the preview background is an app setting —
  it lives in the frame around the preview and never in the SVG text, the
  sidecar or an export; the code dialog always shows the saved bytes. The
  preview stroke width (2026-10-19) is the same kind of setting: one shared
  stylesheet (screen px, non-scaling) adopted by the row thumbnails' shadow roots
  (`svg/strokesheet`, one instance per tab — SVG to upload has its own),
  empty at default; files, Copy and the dialogs keep the real widths.

<a id="i-18"></a>
* **I-18 (SVG cost, RULE 4):** a version's cost is either provider-reported or a
  labelled estimate; the two are never merged, never relabelled and never
  invented, and both survive a restart through the sidecar.

<a id="i-19"></a>
* **I-19 (SVG requests, RULE 6/24):** the per-request size is one value — the
  user's configured size, which no reasoning tier may shrink — and the panel,
  the confirmation and the runner compute it the same way; the confirmation
  lists every request (and its exact images) before anything is sent, and an
  unmappable plan is refused rather than partially sent.

<a id="i-20"></a>
* **I-20 (SVG runs, RULE 4/23):** one request's outcome — status, tokens, cost,
  error — is recorded and shown for that request only; a failed request never
  alters another request's files, usage or cost, and a request whose outcome
  is unknown (stall, disconnect, abort) is never resent — it is reported as
  unknown with its request id, kept in the in-flight journal and offered to the
  user for a deliberate retry. Liveness, never duration, decides when a request
  is over: only silence longer than the stall window counts as dead.

<a id="i-21"></a>
* **I-21 (SVG preview, RULE 3/24):** the preview never recolours the artwork:
  the inline stylesheet is layout only, the root colour is the document's own
  (or the UA default), and the frame's background and contrast outline stay
  outside the document.

<a id="i-30"></a>
* **I-30 (root picking, RULE 4/10):** the Generate SVG tab can always point
  itself at a folder — the picker is offered whether or not a root is loaded,
  because the Selection tab's handle is a fallback for the first run, not a
  lock — and each tab has exactly one picker control.

<a id="i-31"></a>
* **I-31 (SVG list, RULE 3/4):** a Generate SVG row is an **existing canonical
  AI output** whose path an approved decision names — never an invented `_AI`
  name, never a reference image, never a path that is not on disk. A source that
  fails this is excluded **with its reason** and reported (banner + audit + log);
  it is never silently dropped and never offered for generation. The judgement
  lives in one pure module (`svg/sourcelist.ts`), not inside the scan.

<a id="i-32"></a>
* **I-32 (identity, RULE 6/24):** one normalized AI path is one row, whatever
  the row index, the split folder or how many decision records name it; rows are
  ordered by normalized path, so a reload or a repeated rescan yields
  byte-identical rows, order and audit. N records naming one path are one row
  plus N−1 `duplicate` reports — the same file two split folders apart is two
  rows, because it is two files.

<a id="i-33"></a>
* **I-33 (audit, RULE 4):** every scan states the whole picture — files walked,
  AI sources on disk, references excluded, missing sources, duplicates removed
  and final unique rows — as one line in the source bar (`svg-audit`) and in the
  scan log (`svg.scan`, with the numbers as fields), so a list different from
  what the user expects can always be traced to a named reason. The exclusions
  and the audit are part of the snapshot key: a changed count is a changed scan.

<a id="i-34"></a>
* **I-34 (naming, RULE 3):** a source must be a **raster** image. This app's own
  output (`…_AI.svg`) and its versioned artifacts (`…_v1.svg`) are never sources
  and are never counted as AI sources in the audit — otherwise a second run
  would feed an artifact back into generation, and the counts would not add up.

<a id="i-64"></a>
* **I-64 (one icon, its own code, RULE 3/4/13 — 2026-10-09):** in the
  current-SVG regeneration every request carries exactly ONE icon: its composite
  is that icon's AI image, its text is the saved prompt, the icon-name line and
  the newest valid SVG file's text (`lib/svgregen.currentSvgPrompt`, built in
  `svg/regenprompt.ts`). The pair file records the prompt text, never the code.
  A stored choice that cannot run (no saved prompt picked, or the picked one is
  gone or blank) starts no request; the window and the run both say why. The
  drop-down lists the SVG prompt presets (`iconSplitter.svg.prompts.v1`), never
  the metadata presets (2026-10-09 move; the window is `svg/RegenSetting.tsx`).

<a id="i-65"></a>
* **I-65 (one preset rule for every prompt window, RULE 13/24 — 2026-10-09):**
  the metadata prompt and the Generate SVG prompt render the same window
  (`ui/PromptWindow`) with the same preset bar (`ui/PromptPresetBar`) and the
  same gestures (`ui/presetops`: pick, Quick load, Delete, Save as). Each list
  keeps its own key (`iconSplitter.upload.prompts.v1`, `iconSplitter.svg.prompts.v1`),
  so a preset never crosses between tabs. Delete never clears the editor; Save as
  stores a snapshot of exactly the text in the editor; a blank name is refused.

# Generate SVG — task prompts and batch regeneration

Part of [Generate SVG](svg-generation.md). The [results page](svg-generation-results.md) owns saved versions and item review; [I-74…I-77](invariants/svg.md#i-74) pin request and prompt invariants. All provider requests still require the exact-input confirmation (RULE 20).

## Six task-specific prompt choices

A task is the work (`svg.generate`, `svg.regenerate`, `image.edit`) crossed with the selection's shape (`single` for one icon, `batch` for two or more). The selection decides the task; there is no Single/Batch switch in a popup. Each task remembers its own last choice in `iconSplitter.svg.promptTasks.v1`, validated independently on read. The confirmation names the detected task and its default **above** the preset picker (`svg-confirm-prompt-default`). A saved preset that disappeared is named with a fallback; regeneration only offers saved presets and never falls back to the generation prompt. See [storage](storage/svg.md) and [dialog handles](../selectors/svg-generation-dialogs.md).

## What a regeneration sends

The connection's **Images / request** sets one size for generation and regeneration (1–9, shipped default 4); the popup shows that value but has no second count control. A single-icon task sends one icon; a batch splits into requests of at most that configured size, with one square contact sheet per request (up to a 3×3 grid). Each request carries the selected saved prompt, ordered position/name manifest, response contract and **each included icon's readable current SVG code**. Matching the answer uses the title/name first, then declared position; a missing or duplicate identity is never guessed (I-74/I-75).

On confirmation, the queue freezes the prompt choice and text, request size and each icon's code (I-76). Later edits to presets, the selection or connection cannot alter a queued request. An icon without readable code is named and excluded; a missing/gone preset or an over-limit request refuses the send. The pair file keeps only each icon's own prompt text and position, not another icon's code. Row corrections also use this explicit popup during work; there is no dialog-less front-of-queue send.

Focused coverage: [SVG prompt and review tests](tests/svg-prompt-review.md).

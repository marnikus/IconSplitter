# Storage — Generate SVG and image edits

Validate on read (RULE 13). Part of the [storage map](../STORAGE.md).

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/handles["__svg__"]` | Generate SVG root handle | falls back to the Selection handle |
| localStorage `iconSplitter.svg.prefs.v1` | SVG tab view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read (RULE 13); a missing/non-boolean `providerOpen` keeps the model card open |
| localStorage `iconSplitter.svg.imageEditBatch.v1` | independent image-edit icons/request `{ v: 1, count }` (default 4, 1–16; active square size further limits useful cells) | validated integer/version on read; corrupt → default + visible warning in image confirmation; never provider output `n` |
| localStorage `iconSplitter.svg.imageInflight.v1` | metadata only for sent image-edit groups: group id, pair IDs, sent/review state, time, provider/model and optional request ID | validated/bounded; corrupt → empty + warning; never bytes/prompt/key; cleared on confirmed save/discard or known failure, unknown transport outcome remains until dismissal/deliberate retry |
| localStorage `iconSplitter.svg.prompt.v1` | generation prompt | empty/missing → documented default |
| localStorage `iconSplitter.svg.connections.v1` | saved provider setups `{ v, activeId, list }` (2026-10-16): name, kind text\|image, base, model, image params | junk → shipped defaults (GPT 6.1 Sol text + Sunburst image); unknown activeId → first; the active connection mirrors the live config's base+model (one writer, `statemodel` "connections") |
| localStorage `iconSplitter.svg.prompts.v1` | the Generate SVG prompt presets `{ v, presets: [{ name, text }] }` | validated entry by entry (names trimmed 1–60, text ≤ 8000), duplicates keep the last, capped at 50 (`lib/promptpresets`, `state/presetstore`) |
| localStorage `iconSplitter.svg.regen.v1` | "Regenerate SVG from" choice + the saved prompt's name | validated on read (RULE 13); the saved prompts are `iconSplitter.svg.prompts.v1` |
| localStorage `iconSplitter.svg.promptTasks.v1` | the six prompt tasks' remembered choices `{ v: 1, tasks: { [taskId]: { choice, presetName } } }` | validated per task (a bad entry costs only itself); a preset that is gone falls back and is named in the popup (I-77) |
| localStorage `iconSplitter.svg.config.v1` | provider settings (base URL, model id, stall window, retries, concurrency, images/request, max tokens) | clamped on read (RULE 13) |
| localStorage `iconSplitter.svg.inflight.v1` | the in-flight journal: run/batch id, source ids + names, model, start time, provider request id — no key, no prompt, no answer | validated on read; corrupt = empty; cleared when a request gets a confirmed outcome |
| IndexedDB `iconSplitter/secrets` | Requesty API key | never in localStorage, presets, reports or Git (RULE 20); DB version 2 added this store — an install that predates it upgrades on first open, and a write that still fails falls back to a session-only key the UI names as such |
| `<dir>/<stem>.svg` | one generated SVG version | never overwritten; `_v2`, `_v3`… allocated from disk + the pair file |
| `<dir>/<stem>.svg.json` | **the pair's own file** (I-41): pair identity + both image faces + the pair's `decision` + one record per SVG version (status, review, prompt, provider/model, timestamps, tokens, cost + basis, validation, error, batch ref) + the AI source's own regeneration history (`imageVersions[]`, `imagePreferred` — 2026-10-16, see I-71) | one file per pair, beside its images; atomic write; corrupt → named + decision kept (I-43); a legacy `v: 1` file keeps its versions and upgrades on the next write (I-42) |

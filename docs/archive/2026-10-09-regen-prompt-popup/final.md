# Final implementation — 2026-10-09 regen per-batch prompt

## Summary

- First generation: uses main currently loaded prompt shown in prompt zone. Popup says "Generation batch now" (testid svg-confirm-mode) and note svg-confirm-main-prompt.
- Regeneration: prompt chosen per-batch in confirmation popup via dropdown svg-confirm-regen-preset listing saved SVG prompt presets. Selected preset applied to full batch, not main prompt, without reloading main window. Popup says "Regeneration now" + note svg-confirm-regen-note.
- QueueItem now carries regen: RegenPlan|null, making batch self-contained.
- runplan planOf/perRequestOf/guard accept explicit regen.
- runcontrol enqueueBatch accepts regen, startRun uses item.regen.
- SvgPromptZone no longer shows RegenSettingWindow; main window only PromptWindow.
- RegenSettingWindow remains as fallback for front-placement (Regenerate while run in flight, no dialog).
- SvgConfirm split into SvgConfirm + SvgConfirmPager to meet RULE 18 file size (237 + 105 lines).
- Quality gate passes except 3 legacy hotspots (App.tsx, detect.ts, render.ts) — expected.

## Tests

- New TDD file tests/svg_confirm_regen_prompt.test.tsx — 5 tests passing.
- Updated svg_confirm.test.tsx — 15 tests passing, now checks mode badge and onConfirm signature (null for generation, preset name for regeneration).
- Updated svg_regen_ui.test.tsx — 8 tests passing, asserts regen window NOT in main zone, only main prompt.
- Updated svg_queue_ui.test.tsx — 14 tests passing, now handles per-batch regen (1 per request) and pagination in confirmation.
- svg_ui.test.tsx — 38 tests passing.

## Handles

- svg-confirm-mode: "Generation batch now" / "Regeneration now"
- svg-confirm-main-prompt: generation note
- svg-confirm-regen-preset: select for regeneration
- svg-confirm-regen-note: regeneration note
- svg-confirm-problem: no presets problem
- svg-confirm-count/requests etc unchanged but requests now includes prompt name for regen.

## RULE checks

- RULE 18: SvgConfirm 237 lines, SvgConfirmPager 105, runcontrol 252, actions 294, svgregen 91 — all inside 150-300 ideal or justified. No function >30 LOC.
- RULE 16: quality.mjs passes for changed files (only 3 legacy failures).

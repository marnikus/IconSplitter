# Final implementation — 2026-10-09 regen per-batch prompt + full prompt preview

## Summary

- First generation: uses main currently loaded prompt. Popup says "Generation batch now" + note, no dropdown, onConfirm(null). Full prompt preview shows batchPrompt/singlePrompt with manifest + order line + main prompt (svg-confirm-full-prompt).
- Regeneration: prompt chosen per-batch in popup via dropdown svg-confirm-regen-preset listing saved presets. Selected preset applied to full batch, not main prompt. Popup says "Regeneration now" + note. Full prompt preview shows currentSvgPrompt(presetText, stem, code) with title detection line + current SVG code verbatim, loaded via readSvgText.
- QueueItem carries regen plan, self-contained.
- runplan planOf/perRequestOf/guard accept explicit regen.
- runcontrol enqueueBatch with regen, startRun uses item.regen.
- SvgPromptZone no longer shows RegenSettingWindow.
- SvgConfirm split into SvgConfirm (240) + SvgConfirmPager (105) + SvgConfirmFullPrompt (139) for RULE 18/16.
- Quality gate passes except 3 legacy hotspots.

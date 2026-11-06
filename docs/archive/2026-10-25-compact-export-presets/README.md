# Compact Export preset toolbar — plan (2026-10-25)

Replace the tall bordered preset card with one wrapping toolbar: Preset selector,
Load, Save as…, Rename, Remove. Cap selector width instead of stretching across
the popup. Hide the name row until Save as/Rename; show an auto-focused inline
name form with explicit Save/Rename and Cancel, Enter submit and Escape cancel.
Close the form only on successful persistence, retaining errors and typed names
for correction. Selecting a preset or asking removal dismisses the name editor.
Keep explicit Load, collision checks, storage, local/decorated-row safety and
inline destructive confirmation unchanged. Remove duplicated always-visible
helper text; retain accessible labels, tooltips and a zero-height empty status.

Steps: RED compact-idle/form/cancel/keyboard/error tests and adapt existing real
preset workflows to explicit editor entry; implement presentation and boolean
commit success; update owning UI/selector contract and append measured ledger
unread; run focused, types, lint, changed-quality vs dcee771, fast/full gates;
scoped attributed commit/push. No settings/schema/export algorithm changes.

## Completed verification

RED: the new compact-idle assertion failed on the always-visible name input.
Final focused23 tests/5 files PASS; compact toolbar/editor/cancel/keyboard,
existing persistence/rename/remove/error and actual loaded-preset exports remain
covered. Types, lint0errors/23existingwarnings and changed-quality vs dcee771 PASS.
verify:fast PASS. Final full verify PASS:2903tests/277files + native30/5 + build;
coverage95.39/89.87/98.22/98.30 (statements/branches/functions/lines).

Earlier full attempts exposed timing alarms outside this UI: one metadata toast
terminal-summary timeout (the standalone UI suite's83 assertions passed; its
scoped coverage command failed the expected global coverage floor), then native
synthetic detection201.30ms vs200ms. All alarms are recorded, not suppressed:
no assertions, budgets, isolation, source scope or algorithms were changed.
A final unchanged-code full run passed every lane together before push.

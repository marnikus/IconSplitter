# Owners — shared paths, prompts, keys and scans

Choose the row for your change, then open that source file. Part of the [owner map](../OWNERS.md).

| Layer | Files | Owns |
|---|---|---|
| Path capture recovery | `src/ui/rootcapture.ts`, `src/lib/clipboardpath.ts` | the two recovery channels after a pick that missed the path (I-52/I-59): `Rescan`'s one retry and the user's own `Ctrl+V`; the read itself, which reports *why* it was empty (empty / blocked / unsupported) instead of one indistinguishable "none", and adopts nothing it cannot name (the pick's own rule: exact leaf, or the direct parent of a path one level inside the folder — I-35) |
| Scan sequencing | `src/lib/scanseq.ts` | the monotonically-increasing ticket: only the newest scan may commit |
| The batch's output layout | `src/lib/batchlayout.ts` | the names of the app's own output tree — `_split_output` (tolerant variants), `<YYYY-MM>`, `<YYYY-MM-DD_HH-mm-ss>` — read by `lib/splitscope` (which set is reviewable, I-38/I-47) and `lib/rootpath` (where a copy stops, I-28/I-48) |
| The picked root's path | `src/ui/pickroot.ts`, `src/lib/knownroots.ts`, `src/lib/rootstore.ts`, `src/lib/clipboardpath.ts`, `src/lib/rootpath.ts`, `src/lib/copypath.ts`, `src/ui/FolderBar.tsx` | one pick entry point for all four tabs (I-35), the guarded clipboard read + match, the string rules (pure, name-free), the handle-keyed registry + its IndexedDB persistence (I-63: the path is bound to the folder, never its name), the derivation in both directions from a folder already placed exactly (`resolve()` segments, I-51), the copy-text builder every tab shares (I-28/I-56), the live React view of the binding, and the one folder control (green button + read-only path row, I-44/I-46) |
| Shared prompt window (2026-10-09, I-65) | `src/ui/PromptWindow.tsx` (label, reset, editor, preset bar), `src/ui/PromptPresetBar.tsx` (select, Quick load, Delete, Save as), `src/ui/presetops.ts` (the one pick/load/delete/save rule), `src/lib/promptpresets.ts` (list parse, bounds, upsert), `src/state/presetstore.ts` (one versioned localStorage list) | the window and its gestures, written once for the metadata and the SVG prompt |
| The API key on this device | `src/lib/keyvault.ts`, `src/lib/idbvault.ts`, `src/ui/KeySlot.tsx`, `src/batch/store.ts`, `src/svg/keystore.ts`, `src/upload/keystore.ts` | ONE key vault both tabs wrap: `read()` answers where the key came from (`device` / `session` / `unreadable` / `none`) instead of a bare null, `save("")` reports `empty` and touches nothing, and a write the browser refused keeps a session copy; the one adapter wiring that vault to IndexedDB, the ONE widget both provider cards render (state button + `Forget` + editor whose Save is disabled while empty); the page's single IndexedDB connection (`handles` + `secrets` + `rootpaths`, v3) |
| Shared batch progress | `src/ui/ProcessProgressBar.tsx`, `src/lib/processprogress.ts` | [Common presentation and reporter](../process-progress.md), reused by Batch, Generate SVG and Upload |

| Verification harness | `tools/test-harness-policy.ts`, `vitest.config.ts`, `tests/setup/{harness,dom}.ts`, `tests/helpers/quiet.ts`, `tools/verify.mjs`, `tools/harness-benchmark.mjs` | [Isolated project/resource/coverage policy, cleanup, gate/cache contracts and timing evidence](../../TEST_HARNESS.md) |

| All-tab completion audio | `src/ui/completionSound.ts`, `CompletionSoundControl.tsx`, `Workbench.tsx`; runner adapters in Batch/Selection/Sheets/SVG/Upload | [Activation, once-per-run terminal cues, mute, embedded recording and exclusions](../process-progress.md#completion-sound-on-every-tab) |

* `ui/checkedrows.ts`, `ui/rowpresentation.ts` — [large-list selection presentation](../selection-performance.md): canonical snapshot projection, callback bridges and data invalidation.

* `lib/statesort.ts`, `state/useSortChecks.ts` and tab sort/view modules — [reversible selection/approval sorting](../list-state-sorting.md).

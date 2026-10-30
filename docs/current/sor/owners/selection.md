# Owners — selection and pair files

Choose the row for your change, then open that source file. Part of the [owner map](../OWNERS.md).

| Layer | Files | Owns |
|---|---|---|
| Selection logic | `src/lib/pairing.ts`, `reviewfolders.ts`, `imageartifact.ts`, `reviewfilter.ts`, `reviewsort.ts`, `reviewmeta.ts`, `reviewfile.ts`, `src/selection/rootsource.ts` | pairing (order-independent, per-file problem reasons), Selection V2 whole output/history-folder pruning; shared SVG regenerated-image artifact recognition without hiding lookalikes, filters, sorts, status/hotkey semantics, decision records |
| Pair files | `src/lib/pairmeta.ts`, `src/lib/pairrebase.ts`, `src/selection/pairstore.ts`, `src/selection/pairrecord.ts` | the stored shape (identity + faces + decision + SVG versions), parsing/serializing it, the transitions a decision or a version applies, the rebase that re-points a file read from another root (I-49), the read/write of one file beside the images (tmp → verify → overwrite, I-41/I-43), and the record ⇄ pair-file mapping legacy/undo paths use |
| Selection logic (V2) | `src/lib/reviewselect.ts`, `reviewbulk.ts`, `reviewprefs.ts` | checkbox selection, bulk scope/summary, persisted view prefs |
| Shared V2 review engine and comparison UI | `src/selection/state.ts`, `handles.ts`, `fmt.ts`, `thumbs.ts`, `hotkeys.ts`, `Surfaces.tsx`, `useSelection.ts`, `CompareView.tsx`, `StatusFooter.tsx` | reducers, atomic decision IO, bulk reducer, shared hotkeys/surfaces, review UI |
| Selection V2 UI | `src/selectionv2/useSelectionV2.ts`, `SelectionV2Panel.tsx`, `SourceBar.tsx`, `FilterGrid.tsx`, `BulkBar.tsx`, `ZoomSlider.tsx`, `ReviewList.tsx`, `ReviewRow.tsx`, `ThumbPair.tsx`, `SegButton.tsx`, `prefsstore.ts` | view + selection state, list review, bulk bar, zoom, prefs IO |

Only `src/selectionv2/SelectionV2Panel.tsx` owns a review tab. Modules still
under `src/selection/` support V2, Generate SVG, Upload, Batch or history; the
original panel/header/filter/sidebar/list and its thumbnail resolver are gone.

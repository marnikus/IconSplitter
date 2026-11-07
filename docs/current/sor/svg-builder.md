# SVG builder (`svgBuilder`) — approved icon sheets

The seventh Workbench mode turns already-created, `.svg.json`-approved icons into one editable SVG sheet. It is local by default, uses the app's global top menu and undo bar, and never invents or downloads an asset. The [selector contract](../selectors/svg-builder.md), [source owners](owners/svg-builder.md), [storage](storage/svg-builder.md) and [tests](tests/svg-builder.md) are separated.

## Behaviour

- `tab-svg-builder` opens the panel. The header always offers the same global menu, history bar, full-width `＋ Open folder` widget, metadata prompt and shared Gemini provider card as the other modes.
- `discoverBuilderAssets(root)` reuses `discoverUploadSources` with `hideOutside: false` and extra ignored directories. It reads **all folders** under the selected root but registers only rows whose pair sidecar holds a valid approved SVG version. Missing preferred versions, corrupt sidecars and unreadable files are reported, never substituted.
- The repository is read-only and fingerprint-aware. SVG previews and embedded cells are sanitized and recolored from approved files; no unapproved path can enter `composeSheet`.
- `computeLayout`, `selectAssets`, `composeSheet` and `preset.ts` are pure. The same composition drives the live artboard, the exact-request preview and the export, so a displayed cell cannot drift from the delivered file.
- A short pool is reported. Filling unused cells from the full approved library is an explicit checkbox, never a silent fallback. Locks and seeds are reproducible.
- Accepted sheet metadata alone is embedded in exports. SVG, 2× PNG, clipboard and validated JSON preset downloads are atomic; a broken source or unapproved id refuses the download.
- Loading a preset prunes ids that are no longer approved and reports the skipped count.

## Provider and privacy

The Gemini connection is the shared `src/lib/upload/gemini.ts` path: one model id, endpoint, timeout, retry/concurrency config and one IndexedDB key vault. A metadata request starts only after the user previews the exact 512px JPEG and prompt in `builder-meta-dialog` and presses **Send this exact request**. There is no automatic retry, no resend on reload and no live provider call in dev/test. The key is masked, redacted from status text and excluded from exports and logs. A provider draft must be accepted before it enters an export. This follows [RULE 20](../rules/BEHAVIOR.md) and the [exact-request precedent](../selectors/upload-dialogs.md).

## State and undo

`src/lib/session.ts` owns the `svgBuilder` tab, `DEFAULT_BUILDER` and `parseBuilderSlice`; `src/state/appstore.ts` owns the `builder` slice. Placement uses the shared `builderChecked` delta payload; layout/recipe/seed/lock changes use the absolute `builderConfig` payload. Both join the one global timeline, with checked-id lists registered for `svgBuilder` so an undo after a rescan is refused rather than guessed. Display-only prefs and the library view are not history entries.

## Source split

| Layer | Owner |
|---|---|
| pure domain | `src/lib/svgBuilder/{types,config,layout,assets,selection,metadata,svgAsset,compose,preset,undo}.ts` |
| discovery / FS | `src/svgBuilder/{discovery,repository,scan}.ts` |
| provider bridge | `src/svgBuilder/{preview,runSheetMetadata}.ts` |
| state / hooks / actions | `src/svgBuilder/{model,useSvgBuilder,useBuilderBoot,useBuilderPersistence,useBuilderComputed,useBuilderActions,undoBinding,actions/*}.ts` |
| presentation | `src/svgBuilder/SvgBuilder*.tsx`, `src/svgBuilder/svgBuilder.css` |

Interfaces stay narrow: `BuilderActionContext` is the only object actions see, and `BuilderApi` is the only object the panel passes to its split components.

## Verification

Focused TDD contracts cover the domain, all-folder discovery, session/undo, dark UI shell and the one bounded provider request. Changed tab-array tests keep the top menu, log dock, scroll-to-top and session restore honest. The full gate also runs `tsc`, lint, changed-file quality, `verify:fast` and `verify` before the branch is pushed. `npm run test:builder:fast` is an additional measured Node smoke lane: one esbuild bundle of the real pure modules, injected provider seams and the static dark panel shell, with no Vitest workers or VM contexts. Median wall-clock is **0.222 s** versus **2.556 s** for the six-file Vitest builder suite — a **91.3% reduction**. It does not replace the full TDD suite. See [the router](../README.md) and [Code Verification](../CODE_VERIFICATION.md).

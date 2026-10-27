# Shared SVG-to-upload / exported Upload UI

[SVG workflow](upload.md) · [exported Upload](stock-upload.md)

## Ownership, not a second design

The two workflows consume the **same React components**, extracted from the
existing SVG tab HTML. No new stylesheet, tokens or theme; `src/index.css` remains
the sole existing design owner. Labels, content and eligibility may differ;
container markup, fields and interaction grammar do not have independent copies.

| Owner | Shared presentation | Consumers |
|---|---|---|
| `src/ui/PackageList.tsx` | List/head/seven columns/footer/empty state | UploadList, StockRows |
| `src/ui/PackageRow.tsx` | Checkbox/row/detail/file-name/path/info; guarded gestures + Enter/Space | UploadRow, StockRows |
| `src/ui/BulkBarShell.tsx` | Header checkbox/counts/scope/select/deselect/left-right layout | UploadBulkBar, StockToolbar (and existing callers) |
| `src/ui/FolderSource.tsx` | Existing Open folder/Rescan/scope/audit/summary/path toolbar | UploadControls, StockControls |
| `src/ui/ProviderCardShell.tsx` | Existing minimize/restore card and header | UploadControls, StockAccount |
| `src/ui/fields.tsx` | Existing select/number fields, extracted text/toggle fields | SVG controls/settings; stock controls/account/formats |
| `src/ui/PreviewFrame.tsx` | Existing preview box/background/contrast/frame | UploadPreview, StockThumbnail |
| `src/ui/SvgModal.tsx` | Existing SVG modal and header | UploadMetaDialog, stock confirmations |
| `src/ui/DisclosureGroup.tsx` | Native Export settings disclosure, summary and contents | UploadSettingsGroup, StockReport |
| `src/upload/UploadMetaFields.tsx` | Complete MetadataEditor including rights, counts, Copy and validation | SVG metadata, StockMetadata |
| `src/upload/metacopy.ts` | Original explicit metadata clipboard action and errors | SVG UI actions, StockMetadata |

Already-shared owners remain: UploadThumbnailZoom, SettingsPresetControls,
UploadRowBadgeFilter/Badges/Apply/Settings, FolderBar/path capture, reviewselect,
rowgesture, selectshortcuts, history and the metadata validator/carriers. Stock
now also uses `checkedInView` and `checkState`, not equivalent local arithmetic.

## Preserve meaningful boundaries

- Original SVG IDs, labels, modal disclosure and actions remain unchanged.
- SVG row memoization and imperative checked/active projection keep their actual
  DOM refs; the shared row inserts no extra wrapping node. Native control clicks
  do not select rows. Stock receives the same Enter/Space activation behavior.
- Provider-key storage is **not** reused for stock passwords: credentials still
  go only to the native OS keyring. The shared card owns no credentials/state.
- Media readers remain distinct: one previews export rendering, the other reads
  committed physical artifacts. The frame does not render/rewrite either file.
- Data discovery, stock policy, file mutation, paid provider confirmation and
  native transfer adapters retain their respective eligibility/lifecycle rules.
  Reusing a fake SVG job/model for FTPS would violate those boundaries.
- No single percentage of “maximum reuse” is claimed. The contracts below name
  actual shared owners; backend reuse is bounded by semantics/security.

## Tests

- `tests/upload_shared_owners.test.ts`:18 architectural contracts require both
  consumers to import/use the shared owners (CSS matching alone cannot pass).
- `tests/package_ui.test.tsx`: mounted original package grammar, row modifiers,
  keyboard/native-control isolation, disabled state, provider/modal/toggle
  behavior and successful/blocked/unavailable clipboard.
- `tests/stockupload_ui.test.tsx`: real stock panel, same package/editor controls,
  header scope, preset CRUD, native confirmation/cancel, rejected-folder native
  disclosure and Enter activation. The audit caught two nonexistent old
  `up-group-*` class names; sharing DisclosureGroup removes that drift.
- Existing `upload_ui`, presets, decorations and selection/projection/performance
  suites remain equivalence gates. No reduced scopes/budgets or mocked lib rules.

DOM tests are not pixel screenshots or real-browser/OS/stock acceptance.

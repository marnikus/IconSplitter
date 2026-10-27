# Upload code-reuse audit — 2026-10-28

## User correction and plan

Matching CSS names is insufficient: use the same actual components/HTML as the
established tabs and maximize reuse of code already present. Preserve separate
exported-file eligibility, metadata writes and secure native transfer.

### Research: remaining duplicated presentation

| Existing owner | Duplicate in exported Upload | Change |
|---|---|---|
| UploadList list/head/columns/footer | StockRows | Extract existing package-list presentation; both consume it |
| UploadRow root/check/detail/file identity | StockRow | One package row, gestures, detail and file cell; preserve projection refs/memoization |
| UploadBulkBar left/right structure | BulkBarShell already used by stock | Make SVG consume existing BulkBarShell too, preserving its labels/test IDs |
| UploadControls source line/provider card | StockControls/StockAccount | Extract existing source/card presentation for both |
| ui/fields Select/NumberField | Local identical definitions in UploadControls; raw stock selects | Delete duplicates; import existing fields |
| settingsfield ToggleSetting | Raw stock format checkboxes | Extract existing boolean field presentation; reuse in both |
| UploadMetaFields assembled editor | StockMetadata | Share complete metadata editor, not only individual fields |
| UploadPreview frame | StockThumbnail | One frame; media remains domain-specific |
| UploadMetaDialog outer/modal header | Stock confirmation | Extract existing SVG modal structure/header for both |

Already shared: folder/path capture, zoom, badges/catalog/filter/apply, preset
presentation, selection primitives/history, validation, metadata carriers and
native protocol. Do not rewrite those or fake SVG jobs for native transfers.

## Implementation / verification plan

Architectural ownership contracts RED first, plus real row keyboard regression.
Then extract from established markup without new CSS/themes or new designs.
Run existing mounted SVG/stock UI and selection/performance gates, types, expanded
lint, changed quality, verify:fast, verify, extension build and docs/hygiene.
Keep source-specific data/security/lifecycle adapters separate. No live upload.

## Results

- Completed every presentation extraction in the audit table. Both workflows
  consume the actual shared components, not matching class-name copies. Also
  shared the complete clipboard action, text fields and native disclosures;
  stock header/intersection now uses checkState/checkedInView. No CSS changes.
- Architectural18 contracts + six mounted shared-component tests +15 actual
  stock UI tests; existing84 SVG UI and five SVG preset tests remain green.
  RED witnessed for all initial14 ownership contracts and stock Enter activation,
  then again for nonexistent rejected-folder up-group-* styles / disclosure
  ownership. GREEN focused128 tests across five files. Original selectors and
  memoized/ref-based SVG row projections retained; stock name now uses the same
  div.svg-file-name HTML, not its old separate strong/code presentation.
- Node22.12.0: verify:fast and verify BOTH ALL LANES PASSED:3165 tests/306 files;
  full additionally passed30 independent native/performance tests/five files.
  Library-scope line coverage98.40%, functions98.38% (not a UI coverage claim).
- Types PASS; expanded lint0 errors/20 existing warnings; changed quality PASS.
  Docs/hygiene PASS. Focused doc check caught router5003B>5000B after adding the
  new route; shortened wording without removing routes/rules; no raised budget.
- Offline and extension builds PASS. Offline1872.62kB,581.92kB gzip. Compiled CSS
  asset hash unchanged (style-B8NqjSn6.css); no new stylesheet/design introduced.
  Live preview remains available at0.0.0.0:5173. No new dependencies/lockfiles.
- No changed harness, test isolation/scope, algorithms, native protocol, FTPS,
  filesystem metadata writer, credentials, or transfer eligibility. No live
  credentials/provider/stock uploads. DOM ownership/interaction acceptance is
  not pixel screenshots, real-browser visual or OS/keychain/stock acceptance.
- Complete component/adaptor rationale is current in
  docs/current/sor/upload-shared-ui.md. Semantically different workflows are not
  forced into fake shared data models just to claim a reuse percentage.

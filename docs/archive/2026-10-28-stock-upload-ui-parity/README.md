# Upload UI parity correction — 2026-10-28

User correction: Upload must use the same UI, HTML structures and CSS as SVG to
upload / existing tabs, not a separately designed interface.

## Plan

1. Witness failing DOM contracts for existing svg/up layout, bulk shell/zoom,
   seven-column package rows, shared metadata fields and styled confirmations.
2. Delete stock.css and its import. Reuse BulkBarShell, the extracted existing UploadThumbnailZoom, folder
   controls, row badges/filter/catalog and metadata field/rights/validation
   components. Use existing svg/up panel, provider card, presets, settings,
   row/table, status and modal markup/classes; introduce no theme or CSS rules.
3. Keep exported-only discovery, local credentials, eligibility, immutable
   confirmation, native lifecycle and FTPS semantics unchanged. Preset naming
   uses the existing inline editor pattern rather than browser prompts.
4. Run focused regressions, types/lint/changed quality, complete verification,
   extension build and docs checks; record measured results below.

## Baseline

Git metadata aligned to existing remote10fb51e without rewriting working files.
No user changes were discarded. Existing native and stock implementation is the
baseline, not work to repeat. No live provider/stock credentials or uploads.

## Results

- Witnessed RED for the old custom shell/toolbar, missing inline editor, old
  200px clamp and browser confirmation. GREEN:13 real mounted stock UI tests,
  five stock model tests; existing84 SVG upload UI and five SVG preset UI tests
  remained green. Shared SVG zoom moved without changing original handles.
- Deleted stock.css/import; index.css is unchanged. Shared BulkBarShell gained
  an optional disabled flag (existing callers unchanged). Existing metadata and
  preset presentation now have explicit shared exports, not copied editors.
- Node22.12.0: final verify:fast and verify BOTH ALL LANES PASSED,3139 tests in
  304 files, plus the full runner's independent30 native/performance tests in
  five files. Library-scope lines98.40%, functions98.38%; UI acceptance is DOM,
  not a pixel/screenshot measurement. No gate/harness/budget changes.
- Expanded npm lint:0 errors,20 existing warnings. Types, changed quality,
  docs/hygiene and offline build pass. Extension CSP/external-script build passes.
  Offline output1875.07kB,581.54kB gzip. Preview binds0.0.0.0:5173, accepts proxy
  hosts. No real-browser visual, keychain or live Shutterstock acceptance claim.
- First verify:fast failed only docs router5062B>5000B; shortened the changed
  route to4998B. Next run saw an intermittent existing row-badge test readiness
  failure at mount; its nine tests passed focused, then BOTH complete gates
  passed unchanged. A new static-source test initially used a DOM-transformed
  import.meta URL; corrected it to the real filesystem path, retaining checks.
- Clean installation needed npm_config_engine_strict=false for the existing
  locked ESLint10 dependencies whose declared Node minimum exceeds the repo's
  pinned22.12.0. No manifests/lockfiles/toolchain/gate settings changed; all
  verification ran on pinned22.12.0. Foreign-platform node_modules was replaced
  by npm ci; dependencies/build output are deliberately not staged.
- Credential storage, exported-only intersection, native transport/lifecycle,
  receipt policy and FTPS implementation were not changed. No live credentials
  or stock uploads. Manual platform gates from the setup guide still apply.

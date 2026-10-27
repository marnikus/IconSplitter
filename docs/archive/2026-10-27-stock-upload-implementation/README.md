# Stock Upload + on-demand native messaging — implementation

2026-10-27. User authorized all steps and implementation after reviewing the
stock-tab plan and companion lifecycle research. Defaults: Chrome/Edge, optional
extension-packaged offline edition plus explicit HTTPS-origin bridge support;
existing standalone HTML and SVG-to-upload tab remain. One Shutterstock account,
explicit TLS, JPEG/EPS transfers; PNG/SVG/ZIP stay visible with compatibility reasons.
No live stock login/uploads or credentials in development.

## Execution order

1. Witness failing strict exported-record/discovery/planner and native protocol tests.
2. Implement validated exported-only inventory, exact immutable manifests, metadata
   refresh and browser list/selection/badge/stock UI; preserve existing tabs/history.
3. Implement native framed RPC, bounded verified staging/chunks, real explicit-FTPS
   adapter, local OS keyring credentials, cancellation/receipts and per-job cleanup.
4. Add extension-owned confirmation/account setup, exact-origin pairing, native host
   launch/close and offline CSP-compliant app build. Add per-user installation and
   standalone-host packaging without a persistent service.
5. Test real disposable FTPS server, lifecycle processes and IPC resource use;
   run focused/full unchanged gates, update current contracts, record limitations.

## Acceptance boundary

OS/browser-store signing, installation/keychain prompts on the user's PC and actual
Shutterstock import/review remain manual acceptance, never inferred from local
transport tests. No secret is requested in chat; a sandbox helper is not the user's
local machine. Native host uses OS keyring, never returns stored passwords to the UI.

## Results

Pending. Existing remote HEAD c69aba8 metadata aligned with working files without
rewriting them; only prior planning docs/ledger were pending. npm ci restored the
missing native test runtime. No unrelated working files discarded.


## Implemented result and measured evidence

The chosen implementation is the optional **extension-packaged UI**, not a
website-to-extension HTTPS bridge. No external webpage messaging, local HTTP
listener, URI handler or resident service was added. Existing standalone HTML
and all earlier tabs remain. Initial stock transport is Shutterstock, explicitly
confirmed JPEG/EPS only; unsupported controls remain visible. Destination arrays
and named stock presets are closed shipped policy, not arbitrary hosts.

Completed automated/developer steps: strict JSON∩export-file inventory (including
legacy sha256: declarations and relocation), metadata-only JPEG/SVG/EPS refresh
and rollback, pinned selection/zoom/badges/destinations/formats UI, shared badges
and global selection undo, native nonce/digest/framed chunk/ACK protocol, private
verified staging, certificate-validating explicit FTPS, OS-keyring adapter with
fail-closed storage, durable uncertainty/terminal receipts and replay blocking,
source-channel cancellation/process exit, extension CSP build and per-user
native registration/SEA packaging. No canceled desktop application was revived.

Measured gates on Node22.12.0/npm10:

- Focused red tests first; exported inventory/native prototype green before UI
  integration. Later timeout-message regression also witnessed red, then green.
- `npx tsc --noEmit`, `npm run lint` (including companion/extension), changed
  quality: PASS. Native production also has hard30-line/4-param/CC10/depth4
  lint limits; existing harness/coverage/performance policies are unchanged.
- `npm run verify:fast`: ALL LANES PASSED.
- `npm run verify`: ALL LANES PASSED;3128 tests/304 files; separate native
  uninstrumented performance alarms30 tests/5 files PASS. Lib line coverage
  98.40% (baseline98.39%); every new stock-upload lib function covered100%.
- Real disposable local FTPS: exact bytes/control+data TLS, certificate rejection
  before login, collision refusal, staging→FTPS path and lost final reply with
  bytes present remotely marked **uncertain**, no retry: PASS. Fake credentials
  and in-memory certificates only; no live stock login or upload.
- Extension build: PASS; generated HTML has only external scripts, no inline
  script. Background exact-origin/source ownership is tested with structural
  Chrome-port fakes, **not** an installed real browser.
- Linux-x64 SEA package: built with pinned runtime; temporary-HOME install,
  exact-origin allowlist, wrong-origin exit1, hello(version1/64-char nonce),
  cancel exit0 with no stderr, uninstall: PASS. No OS credential was saved.
- npm production workspace dependency audit:0 advisories reported. This is not
  an audit of the embedded runtime, native Rust dependency graph or signing.

Native-only synthetic IPC/staging probe (single run; decimal MB; source uses
128KiB ACKed chunks; transport is a synthetic sink, NOT FTPS):

| Input MB | Elapsed ms | Host RSS MiB sampled at transport handoff | Chunks |
|---:|---:|---:|---:|
|1|74|55|8|
|10|238|61|77|
|50|992|72|382|
|100|2050|86|763|

Includes hello, staging, byte/digest/header checks, receipts and process exit.
RSS is a handoff sample, not a continuously measured peak. This is **not** an
end-to-end browser/native-messaging or internet-FTPS throughput measurement.
Do not infer a user-PC speed target from it. Test is reproducible via
`npx vitest run tests/stockupload_bench.test.ts --silent=false`.

## Explicit remaining release/PC acceptance

See the current [setup and acceptance guide](../../current/sor/stock-upload-setup.md).
No real browser binary was available here. Chrome/Edge lifecycle with devtools
closed, target Windows/macOS installers/signing, OS keychain prompts and actual
Shutterstock ingestion/submission/review remain manual gates, NOT claimed done.
The optional package is a developer implementation, not a signed/store-approved
production release. Stale locks after hard kills require explicit reconciliation;
FTP LIST→STOR cannot guarantee no-clobber against an independent remote uploader.

Earlier verification failures were fixed rather than bypassed: missing Rollup
startup dependency restored by npm ci, two exact supported-kind/tab inventories
updated for the new workflow, docs size budgets restored, and a test-generator
syntax/lint error repaired. No skipped tests, weaker budgets or cached successes.

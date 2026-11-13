# Image regeneration: automatic Apply and batch progress

## Problem and acceptance (before implementation)

The returned-grid Apply/Discard dialog interrupts unattended image batches.
Add a persisted **Regenerate images: apply automatically** checkbox in the
image request confirmation. Default OFF preserves manual review. ON explicitly
accepts positional crops without a post-response popup, not image-identity
recognition: disclose that moved/swapped artwork cannot be detected. Keep the
initial paid-request confirmation and exact reference preview. Freeze this
choice at confirmation, so later preference changes cannot alter a running job.

Show image regeneration using the shared Batch-style process bar, including
single-source requests and composite batches. Show total/processed/remaining,
request position, saved/failed/discarded counts, waiting-review and stopping
states; retain truthful completion/cancellation until dismissed. Portal it above
the tabs so the kept-alive panel does not hide it. Image Stop remains independent
of concurrent SVG Stop/progress. No fabricated progress while awaiting a provider.

## Dependencies / hazards

- `SvgImgConfirm` owns the user choice; `imgprefs` validates local preferences.
  `PreparedImageRun` carries the immutable per-run auto-apply decision, separate
  from preview bytes; toggling the checkbox must not rebuild/pay for a request.
- `imgbatchrun.landGroup` currently routes multi-cell crops to `awaitReview`.
  Auto-apply must reuse `applyCrops` with its exact same stale-source/root/pair
  guards, verified independent version saves, usage allocation and journals.
  Never bypass checks or retry uncertain provider work. Stop prevents unsent
  groups but lets already-sent responses finish under their frozen policy.
- `imgactions` owns the legacy single-image runner and Stop. Both runners need
  image-only progress without changing shared SVG progress or resource leases.
- Use a session-local external progress store keyed by existing `SvgRefs`, plus
  `ProcessProgressBar`; do not persist controllers, prompts, bytes or process state.
  Publish progress after individual outcomes, not just after a whole grid; never
  report skipped/failed/discarded as successful saved images.

## Steps / TDD and gates

1. Real-panel RED for checkbox/default, auto-apply multi-request execution,
   immutable policy and visible progress. Keep all existing manual-review tests.
2. Add validated preference + explicit checkbox/risk note, snapshot flag, and
   guarded automatic crop application. Add isolated progress state/bar wired to
   both image runners, review, Stop, outcomes and final cleanup.
3. GREEN regressions for default manual review, automatic independent histories,
   stale-cell refusal, Stop after send, partial failures and progress isolation.
4. Update owning behaviour/invariants/storage/selectors/test inventory and router.
   Run types/lint/changed-quality vs50d6aba, verify:fast, full verify/native budgets.
   Append measured ledger without reading it; no live paid provider calls.
5. Verified/attributed scoped commit and push the current branch only. Exclude
   generated builds/dependencies. Record measured results below.

## Results

Implemented and verified on `arena/cf992ba5-iconsplitter`.

- Persisted default-off opt-in checkbox + explicit moved/swapped-artwork warning
  in initial confirmation; frozen `PreparedImageRun.autoApply`. Manual remains
  unchanged by default. Automatic positional crops use the exact existing
  guarded Apply path, independent version histories and request journal cleanup.
- Image-only session progress store and shared Batch-style bar for single and
  composite runners. Per-cell counts, review/saving/stopping states, independent
  Stop, partial cancellation and retained/dismissible final status; portals out
  of hidden tabs. SVG process counters/controllers remain separate.
- Extracted composite request journal/send announcements into `imgbatchjournal`
  to keep the runner within its size limit; no algorithm/provider/harness changes.

### Verification and evidence

Evidence: `/home/user/image-auto-apply/` (outside Git).

- `red.log`: 2 new real-panel regressions RED / 34 existing GREEN (missing checkbox
  and missing image process bar). `expanded-check.log`: 46/46 GREEN across 5 files,
  including 38 real image-run UI tests, persisted opt-in validation, multi-request
  automatic saves, immutable policy, stale-cell refusal, Stop after send, real
  partial progress and portal/late-event isolation. Existing manual 3×3 test now
  waits for all nine commits/review close instead of inspecting after only the
  first saved cell; all original per-pair assertions preserved.
- Standalone types and lint PASS (0 errors / 23 existing warnings). Explicit
  changed quality vs `50d6aba` PASS. Docs navigation 4/4 PASS.
- `verify:fast` PASS. Initial full verify: all 2,619 functional tests and build
  passed, but native synthetic detector measured 207.3 ms against unchanged
  200 ms alarm. Unmodified isolated native lane then passed 30/30; complete full
  rerun `verify-full-final.log` ALL LANES PASS: 2,619 tests / 250 files plus native
  30 tests / 5 files. No skipped tests, weakened assertions/budgets or cached
  success; algorithm and test harness untouched.
- Coverage scope/thresholds unchanged: aggregate src/lib 98.03% lines, 89.31%
  branches. Self-contained production HTML 1,790.17 kB / 555.35 kB gzip.
  Exact supplied completion recording retained. No live provider requests made.
- Owning behaviour/invariants, storage, selectors, owners/tests and router
  updated; append-only measured ledger written without reading it. Generated
  build/dependencies/evidence excluded from the scoped commit.

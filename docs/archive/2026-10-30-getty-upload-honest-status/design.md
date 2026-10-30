# Fix plan — one honest success rule for the Getty web upload

**Date:** 2026-10-30 · **Companion:** `docs/archive/2026-10-30-getty-upload-honest-status/research.md`
· **Status:** plan only; no production code changed in this change.

## 1. Goal, one rule, non-goals

**Goal.** Every surface of a Getty run — the progress bar, its title and detail
line, the per-row status, the row badge, the log and the closing toast — must show
the *same* per-contribution truth that the contributor page shows, during and
after the run.

**The one rule (single source of truth).**

> A contribution is **uploaded** only when its card carries Getty's
> `data-cy="pending-icon"` + `aria-label="Ready to submit"` and does **not** contain
> `data-cy="invalid-file-media"`. A picture proves *arrival* only. A read that
> cannot state readiness proves *nothing*.

Per contribution only two states are terminal: `ready` and `failed` (Getty's own
"Upload failed"). `pending` (not listed yet) and `arrived` (picture, still
ingesting) are open. A *reading* has one extra verdict, `unverified` (page
unreadable / no cards), and it is an **error**, never a success; it never turns a
contribution into `ready`.

**Non-goals.** No change to discovery, presets, the batch-creation flow, the
metadata typing rules (tags stay untouched), credentials, or any non-GETTY target.
No live Getty call while developing or testing (RULE 20).

## 2. Truth model (shared by helper, route and app)

Per contribution (= one stem, a JPEG/EPS pair counts once):

```ts
type ContributionState = "pending" | "arrived" | "ready" | "failed";
interface ContributionTruth {
  name: string;            // the name the run used (never page text)
  stem: string;            // the matching key
  id: string | null;       // Getty's own `ID: …`
  state: ContributionState;
  picture: boolean;        // the card rendered its image
  ready: boolean;          // pending-icon / Ready to submit, and not failed
  verified: boolean;       // this reading came from rendered cards
}
```

Batch verdict derived once, never re-derived differently in another layer:

| Situation | `ok` | `ready` (batch) | Meaning shown to the user |
|---|---|---|---|
| every stem `ready` | true | true | uploaded / ready to submit |
| some `ready`, some `failed`, none pending | true (partial) | false | `N uploaded, M failed` |
| some `ready`, some `pending`/`unverified` | false (`timeout`) | false | `N ready, M still ingesting / not verified` |
| page unreadable, no cards | false (`page`) | false | `cannot verify this batch` |
| attach/listing/auth/browser failure | false | false | existing codes, unchanged |

## 3. Fix A — the helper stops producing the lie

`tools/bridge/gettyweb/`

1. **`driver.mjs::readUploadState`** — keep the existing fields (other code reads
   them) and add `contributions: ContributionTruth[]` built from the same
   `uploadCards()` scan. `uploaded` keeps its documented meaning (*arrived*) and is
   never again read as success by any consumer. `cardsPresent: false` must stay an
   explicit "cannot verify" signal rather than an empty-but-fine state.
2. **`session.mjs::progressOf`** — always emit `ready` and `verified` (drop the
   "omit zero" rule at `src/lib/stockupload/gettyprogress.ts:34`), plus `arrived`
   (pictures). `uploaded` stays for backwards compatibility but is documented as
   *arrived*.
3. **`session.mjs::acceptedOf`** — return `readyToSubmit` **only**, never
   `state.uploaded`. That is what the client type already promises for `accepted`
   (`src/lib/stockupload/gettywebclient.ts:38-39`) and what `outcomeOf` assumes.
4. **`session.mjs::upload`** — return `{ ok, verified, outcomes: ContributionTruth[],
   report, batchId, batchNote }` on **both** branches:
   - `ok: true` when no expected stem is `pending`/`unverified` (whatever the
     failures are) — the batch may still be refused later, but the ready pairs stay
     successes;
   - `partial: true` whenever at least one stem is `failed`;
   - `ok: false` with `outcomes` still populated when a stem is still
     `pending`/`unverified` at the deadline. Never collapse "some failed" into
     "everything failed".
5. **`contribute.mjs::finalizeBatch`** — reorder so a rejection no longer aborts
   verification (F5):
   1. fill metadata for the non-rejected files (unchanged), **but** collect
      `row-not-found` / `editor-not-ready` / `filled-unsaved` statuses into a
      *re-fill queue* instead of discarding them (F6);
   2. bulk save;
   3. `verifyReadiness(expected, options)` over `pending = expected − ready − failed`
      — the rejected stems are excluded from the wait, not from the run;
   4. on each readiness pass, first retry the re-fill queue (card now present?),
      then re-save when something is still pending;
   5. always report `outcomes`, `failed`, `pending`, `verified`, `resaves`;
      `ok` follows §2. A rejected stem no longer produces the run-level
      `page` failure that erased every other success.
6. **`contribute.mjs::verifyReadiness`** (rename of `waitForReadyToSubmit`) — the
   clock follows progress, not the wall (F7):
   - `deadline = lastProgressAt + readyPerFileMs` (default 75 s), where
     `lastProgressAt` is reset by **any** real progress — a card turning ready, a
     re-fill opening a drawer, a card appearing — and an absolute
     `maxReadyMs` (default 300 s, env-overridable) caps the whole pass, so an
     idle page still fails honestly;
   - re-save cadence unchanged (30 s) but at most `READY_RESAVES` **per pending
     batch**, and only while at least one pending stem exists;
   - a first read that throws is retried (`readStateSafe` already exists); it must
     not take the `verified:false` fast path until at least `READY_READS` (3)
     consecutive failures, and then it must return `ok:false`, not `ok:true`;
   - the state after every pass is published through `onState` so
     `/getty-web/progress` (and the app) can show `ready/pending/failed` live.
7. **`contribute.mjs::reattachRejected`** (new, small) — when the batch page offers
   a removal/replace control for an `invalid-file-media` card, remove it and
   re-attach that stem once per run (`MAX_FAILED_RETRIES = 1`); when no such control
   exists, leave the card alone and report it — never guess, never duplicate.
8. **`routes.mjs`** — publish the truth and keep the HTTP status for *transport*:
   - 200 with `{ ok, verified, partial, accepted(=ready), failed, pending,
     unverified, contributions, batchNote, completed, ready, completion, metadata }`
     whenever the page was driven; `accepted` may be a subset;
   - 5xx only for `bad-request | auth | browser | page` where no page state exists;
   - `ready = verified && pending.length === 0 && failed.length === 0`.
   - `/getty-web/progress` gains `ready` (always), `arrived`, `pending`, `verified`.
   - `/getty-web/retry` (new): `{ icons }` → for still-open session: re-read, re-fill
     missing drawers, re-save, re-verify, answer the same `outcomes` shape. No new
     batch, no new attach.

## 4. Fix B — the app stops rendering the lie

`src/`

1. **`stockupload/gettywebtransfer.ts`**
   - `settledFiles` → `terminalFiles(p) = (p.ready ?? 0) + p.failed`; add
     `arrivedFiles(p)`. Pictures never count as done.
   - `progressLabel` — "on Getty" for arrived, "ready to submit" for ready,
     `, N failed`, and in the metadata phase never print `listed` as if it were
     saved: `saving metadata — N of M ready`.
   - `outcomeOf` — success only when `verified && ready` and not in `failed`;
     otherwise the exact reason (`Upload failed (ID …)`, `not verified`,
     `still ingesting after … s`).
   - `uploadGettyWebRun` — map `res.outcomes` when present; a batch-level failure
     must never mark a verified icon failed (F4).
2. **`stockupload/progressmodel.ts`**
   - `done` = terminal (ready + failed); `arrived` carried separately for the detail
     line; `percent = round(done / total)`, capped at **99** while `complete` is
     unset (100 % only when the run returned).
   - `finished = step.complete === true` (a run may end cancelled → finished with
     its own title). Reaching the total no longer finishes the bar.
   - `title` matrix: running → `Uploading to stock sites`; running with failures →
     `Uploading — N file(s) failed`; returned & 0 failed & all ready → `Upload
     complete`; returned with failures → `Upload finished with N failed`;
     cancelled → `Upload cancelled`.
   - `UploadProgressStep` gains `arrived?`, `ready?`, `pending?`, `unverified?`,
     `cancelled?` (all optional, additive).
3. **`stockupload/statusflush.ts`** — unchanged mechanics, truthful input: a row is
   `uploaded` only when its whole pair is `ready`; `partial` when one format of a
   multi-format target is ready and the other is not; the badge is assigned only for
   `uploaded`; the failure reason always names the file and Getty's reason.
4. **`stockupload/runupload.ts`** — `liveGettyProgress` reports terminal counts and
   keeps `arrived` in the label; `finishedProgress` fills the new fields from the
   summary (`failed`, `unverified`, `cancelled`) so the final bar can never read
   "complete" on a run with failures.
5. **`stockupload/panelops.ts`** — `summarizeBatch` keeps its wording but uses the
   new counts; add a *"Retry not-ready files"* action on the finished bar (visible
   only when the run left `pending`/`unverified` items) that calls
   `/getty-web/retry` with just those icons, keeping the same batch, and updates the
   rows from the returned `outcomes`.
6. **`lib/stockupload/gettyprogress.ts`** — parse `ready/arrived/pending/verified`
   unconditionally; no "omit when zero".

## 5. Progress contract (replaces the one in `sor/stock-upload.md` §2)

- The bar counts **verified outcomes only**: `ready + failed`, in files (a JPEG/EPS
  pair = 2 files of the same contribution, as today).
- A failure advances the bar but **never** silences itself: the title/detail always
  carry the failed count from the moment it exists.
- 100 % and the ✓/✕ finished state are produced by the **run returning**, not by a
  count.
- The detail line names the phase honestly: `uploading N of M`, `on Getty N of M,
  K ready`, `N of M ready to submit`, `N failed`.
- The user's run would therefore read, at the moment of the screenshot:
  `Getty Images (web upload): 10 of 14 file(s) ready to submit, 2 failed, 2 still
  ingesting` (the units are file names, as today; the two open names belong to the
  one lagging card) — never 100 % "Upload complete".

## 6. Last-file guarantee (complaint 2)

The last-arrived contribution must be *pursued*, not dropped:

1. **Never skipped by a sibling's failure** — verification and re-save run for all
   pending stems even when another card is `failed` (Fix A5).
2. **Re-filled, not only re-saved** — a drawer that could not be opened is retried
   on every readiness pass while its card exists; the run cannot claim it is only
   "awaiting validation" when its metadata was never typed (Fix A5.4).
3. **Progress-driven budget** — the readiness window extends while cards flip, so
   the last file gets a real chance (Fix A6).
4. **Post-run retry** — a contribution still `pending`/`unverified` when the call
   returns is retryable in place: `/getty-web/retry` re-checks and re-saves the open
   batch, then re-verifies (Fix A8, B5). If the session is gone, the finished bar
   tells the user the honest alternative ("re-run these icons into a new batch")
   instead of silently leaving them.
5. **Rejected cards** — one bounded re-attach when the page offers removal (A7);
   otherwise the item is reported failed with Getty's ID and is the only thing a
   re-run needs to carry.

## 7. TDD plan (witness red first — RULE 8, no provider calls)

Rewrite the tests that pin the old behaviour:

| Test file | Change |
|---|---|
| `tests/stockupload_getty_web.test.ts` | `verifies the bar against the cards turning Ready to submit` must now expect `done` **not** to include pictures (`{total:14,uploaded:12,ready:10,failed:2}` → `done 12`, percent < 100, run still running). New: a returned run with failures ends titled `Upload finished with 2 failed`. |
| `tests/stockupload_progress_ui.test.tsx` (+ a model-level case beside it) | `uploadBar` matrix from §4 item 2 — today it has no direct test at all: reached total while running ≠ finished; 100 %/✓/✕ only when `complete`; failed count in the running title; cancelled title. |
| `tests/getty_web_finalize.test.ts` | A page with one `invalid-file-media` card plus one lagging card: readiness still runs, the lagging card is re-saved and turns ready, `outcomes` keep the rejected one failed and the rest ready. A first `readUploadState` that throws → `ok:false`/`page` after the retry threshold, never `verified:false`+`ok:true`. A `row-not-found` file whose card appears on the second pass gets filled. |
| `tests/getty_web_batch.test.ts` | Captured DOM (the user's seven-card page is the fixture): `readUploadState` returns 5 ready, 1 failed, 1 awaiting; `accepted` must be the 5 ready stems only. |
| `tests/getty_web_driver.test.ts` | `Contributions` truth list per card; a card with a thumbnail but `not-ready-icon` is `arrived`, never `ready`. |
| `tests/bridge_getty_web.test.ts` | `/getty-web/upload` answers 200 with a partial payload (ready subset + failed + pending) and `ready:false`; `/getty-web/retry` re-checks an open session and refuses without one (409). |
| `tests/stockupload_getty_web.test.ts` (status) | A run with `accepted: [5 stems]`, `failed: [1]` must store 5 rows `uploaded` (badge assigned) and 1 row `failed`; **no** row is marked uploaded on `arrived`. |

Also keep: `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
`npm run verify:fast` before commit, `npm run verify` before push (RULE 16 limits
apply to every new helper function).

## 8. Acceptance criteria (traceable to the report)

- **AC1** With the captured page (5 ready, 1 "Upload failed", 1 not-ready) the bar
  never reaches 100 %, never says "Upload complete", and its detail line names
  `10 of 14 file(s) ready to submit, 2 failed, 2 still ingesting`. *(complaint 1)*
- **AC2** The same run's rows: 5 `uploaded` with the Getty badge, 1 `failed` with
  `Getty reports "Upload failed" (ID 2302700698)`, 1 `failed` with
  `not Ready to submit after 75 s — last state: ingesting`; the log has one line per file and the summary
  does not claim full success. *(complaint 1)*
- **AC3** `accepted` from `/getty-web/upload` equals the ready stems exactly; a
  thumbnail-only card is never in it. *(F3)*
- **AC4** A rejected card does not prevent the readiness pass; the last-arrived
  contribution is re-filled and re-saved while it is pending, and flips to ready in
  the same run when Getty allows it. *(complaint 2, F5–F7)*
- **AC5** A page that cannot be read is reported as *cannot verify*, never as
  success; a batch-level failure does not erase verified pairs. *(F4)*
- **AC6** A finished bar with failures offers *Retry not-ready files*, which
  re-checks/re-saves the open batch without creating a second one. *(F7)*
- **AC7** No test in the suite asserts "pictures = success" anywhere.

## 9. Sequencing, risks, doc updates

**Phases.** P1 = truth plumbing only (driver state → session → route → app model →
bar/status), because it removes both user-visible lies without new browser
behaviour. P2 = readiness/re-fill/retry design (A5–A7, B5). P3 = optional rejected
re-attach (A7) once a removal selector is verified against the live page.

**Risks.** (a) Getty DOM drift — every new selector stays in `driver.mjs` with a
captured handle; a missing one is a named `page` failure. (b) Longer runs when many
cards lag — bounded by `maxReadyMs` and the retry button; the window only extends on
real progress. (c) A resave storm — one save per 30 s pass, never per card.
(d) Duplicate contributions — retries reuse the open batch; a new attach only after
an explicit removal.

**Docs to update when this is implemented** (RULE 17): `docs/current/sor/stock-upload.md`
§2 progress bullet (replace the "100 % on arrival" contract), `docs/current/sor/stock-upload-getty-web.md`
§2 steps 5–7 and §6 (add the arrived/ready distinction and the retry route),
`docs/current/selectors/stock-upload.md` (progress fields, `contributions`,
`accepted`, `/getty-web/retry`), `docs/current/sor/tests/upload.md` (new cases),
`docs/HISTORY_INDEX.md` (this folder). Until then the current pages keep describing
today's behaviour; `sor/stock-upload.md` carries a one-line pointer to this plan so
the wrong contract is not re-adopted by accident.

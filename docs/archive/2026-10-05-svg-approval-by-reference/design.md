# The approval is of the reference — the AI image that arrives later must be listed (2026-10-05)

Reported right after `2026-10-05-svg-source-list-audit` (which stopped the list
from offering reference images and duplicates). The user's words:

> some icons are not detected but are exist correct in folder. But not detected
> or detect with errors.
>
> **9 approved source(s) are not listed** — 9 with no AI result (reference
> images). `2026-10/2026-10-01_10-24-31/icon-airplane-landing_AI_8/split_01/
> icon-airplane-landing.png` is a reference image, not an AI output;
> `…/split_02/icon-airplane-landing.png` is a reference image, not an AI output
> (+7 more). Nothing on disk was changed
>
> but in folder both file are: ref and AI icon

The folder named in the report holds **both** files:

```
_split_output/2026-10/2026-10-01_10-24-31/icon-airplane-landing_AI_8/split_01/
    icon-airplane-landing.png          ← the reference the batch copied in
    icon-airplane-landing_AI_8_01.png  ← the AI split icon
```

…and the app answers that the approved thing is "a reference image, not an AI
output", listing **nothing** for it. Reproduced against a fake root before any
production line was written (`tests/svg_sources.test.ts`, case 1): audit
`5 files · 2 AI sources · 2 references excluded · 0 missing · 0 duplicates →
0 rows`, with two `not-ai-output` exclusions for the two references — while
`aiSources: 2` says the two AI icons are on disk and paired.

## 1. Root cause — an approval was matched by *id* and by *AI path*, never by *reference path*

`decide()` in `src/svg/sourcelist.ts` accepted exactly two proofs of approval:

1. a record whose `pair_id` equals the pair's own id;
2. an approved record whose `ai_result` is exactly the pair's AI path.

Both are **derived from the pair**, and the pair id is derived from
`(folder, base, AI variation suffix)` (`lib/pairing.pairId`). A decision record
written while the AI image was not there yet carries:

```json
{ "pair_id": "pair_62b835a5",            // pairId(dir, "icon-airplane-landing", "")
  "source":  "…/split_01/icon-airplane-landing.png",
  "ai_result": null,                     // there was no AI image to name
  "decision": "approved" }
```

(`src/selection/state.ts` → `recordsFromViews` writes `ai_result: v.ai?.relPath
?? null`, so a pair approved while its AI side was absent is stored exactly like
this, and `reviewfile.mergeDecisions` keeps it as an orphan when its id is not in
the current scan.)

When the AI image then appears — `icon-airplane-landing_AI_8_01.png`, a *split*
name whose variation suffix is `_8_01` — the pair on disk is
`(dir, "icon-airplane-landing", "_8_01")`, a **different id**, and the record
names no AI path. So neither proof matches: the healthy pair counts as *not
approved* and no row is produced, while `addRecord` reports the record itself as
`not-ai-output` — "a reference image, not an AI output" — because it checks
`r.ai_result === null` **before** asking whether an AI image now sits beside
that reference.

The same blind spot explains the "detected with errors" half of the report: the
pair is detected (the audit counts it as an AI source) but every approval rule
misses it, so the only thing the user sees about it is an error line.

Nothing is wrong with the file set, the walk, the pairing or the audit counts:
`aiSources: 2` is right. The missing rule is that **an approval is of the
reference**, and the reference path is the one stable thing in the record.

## 2. The contract (what approves a row now)

A pair on disk is approved when **any** of these holds:

1. a record whose `pair_id` is the pair's own id says `approved` (unchanged — a
   `declined`/`pending` record with that id is the authoritative word);
2. an approved record whose `ai_result` is exactly the pair's AI path
   (unchanged — recorded approvals survive a file moving between `split_NN`
   folders);
3. **an approved record with no `ai_result` whose `source` is exactly the pair's
   reference path** — the record was written before the AI image existed, and
   the image beside that reference is its result.

Rule 3 is bounded so it can never approve more than the user approved:

* it applies to **the pair that owns the reference** — the first pair in the
  canonical `(folder, base, suffix)` order whose `source` is that path, i.e. the
  canonical `…_AI.ext` result when one exists, otherwise the lowest variation.
  A second AI image beside the same reference is a different source and is not
  dragged in;
* it is skipped when **any** record names that pair's AI path — then that record
  (approved *or* declined) is the authority for the image, so an explicit
  decline is never overridden by an older reference approval;
* it needs a reference: a pair whose `source` is gone cannot be matched this way.

And on the reporting side, `not-ai-output` now means what it says: a record with
no `ai_result` **and no pair on disk owning its reference**. When a pair does own
it, the record *is* that pair's approval: it is absorbed (first one) or reported
as a `duplicate` (second one), exactly like a record naming an AI path.

Nothing else moves: `ai-missing`, `no-files`, `artifact`, `duplicate`, the audit
counts, the row model and the version mapping are untouched.

## 3. Module plan (RULE 18: ideal 150–300 lines, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/svg/sourcelist.ts` | `referenceOwners`, `approvedPairs`, `isApproved` (rules 1–3), `approvedAiPath`, `coversReference`, `newSink(owner)`; `Sink.owner`; `addRecord`'s `not-ai-output` branch asks the owner map first; the audit moved out | 256 → 262 |
| `src/svg/audit.ts` | **new**: `ScanAudit`, `fileTally`, `auditText`, `exclusionSummary`, `KINDS`, `plural` — the numbers and their one wording | 70 |
| `src/svg/sources.ts` | imports the tally from `./audit`; the dead `export { auditText }` removed | 137 → 133 |
| `src/svg/scan.ts`, `SourceLine.tsx`, `SvgPanel.tsx`, `scankey.ts` | import the audit wording / type from `./audit` | unchanged |
| `tests/svg_sources.test.ts` | the reported tree with its AI icons, plus the bounds of rule 3 | +~105 |
| `docs/current/SYSTEM_OF_RECORD.md` | the discovery bullet + invariant **I-35** + two module-map rows | +~14 |
| `docs/current/QUALITY_RECHECK.md` | dated entry with the lanes | +~55 |
| `docs/README.md` | archive row | +1 |

The audit had to move: `sourcelist.ts` reached 322 lines, and a file over the
RULE 16 §16.1 line fails for new code. Splitting it is the RULE 19 answer (size
last, and by responsibility, not by trimming comments) — the counts and their
wording were already a second concern inside a file whose header claimed only
the selection rules.

No UI file changes: the banner (`svg-warn-excluded`), the audit line
(`svg-audit`) and the scan log keep their handles and wording — only the numbers
behind them change, so the 1440×900 layout result of the previous change still
holds (no markup, no new control, no new hit-test).

## 4. TDD order (red before green)

1. **The report itself** — the split folders hold the reference *and* the AI
   icon, approved by a reference-only record: the AI icons are listed, one row
   per path, and no `not-ai-output` exclusion survives.
2. **The bounds of rule 3**
   * several AI images beside one approved reference → only the owner is listed
     (the canonical `…_AI.png` when it exists), the others are simply not
     approved and are not reported as anomalies;
   * a `declined` record naming the AI path (same id, and a stale id) → no row,
     the decline wins over the older reference approval;
   * the pair's own `approved` record naming the AI path → unchanged (one row);
   * two reference-only records for one owned reference → one row + one
     `duplicate`;
   * a reference-only record whose reference is **not** on disk → still
     `not-ai-output`, with the same reason text.
3. **The audit** for the reported root: files / AI sources / references /
   missing / duplicates / rows, asserted as literals, and the one-line text.
4. **Determinism**: repeated discovery over the same root, and the same root
   built in a different insertion order → byte-identical rows, exclusions and
   audit.
5. Existing suites that encode the neighbouring contract (`svg_io`, `svg_scan`,
   `svg_ui`) re-run unchanged where the rule does not apply, and are updated
   where a fixture's numbers move.

## 5. Verification

* `npm run verify` (6 lanes) and the RULE 16/18 recheck over the touched files.
* The regression case is the user's own tree, so a future change cannot quietly
  re-hide an AI image that sits beside its approved reference.
* Coverage of `src/lib` must not drop (the change is in `src/svg`, outside the
  coverage include, so the lane is a no-op guard).
* Headless-Chromium probe: **not re-run** — no markup, selector or layout change
  (see §3).

### 5.1 Results (2026-10-05)

* `tests/svg_sources.test.ts` — 9 new cases (20 in the file): the reported tree
  with its AI icons (rows + the audit asserted as literals), the owner bound, the
  two decline cases, the reference with no image beside it, the duplicate count,
  repeat-scan identity, and the reported icon end-to-end through `loadSidecar` →
  `toRow` (newest version v2, status `generated`). Whole suite: **77 files /
  746 tests**, all green.
* `npm run verify` — tsc clean; ESLint 0 errors, 8 warnings (all pre-existing
  baseline); quality gate **PASSED** over the 7 changed files; coverage
  unchanged; single-file build produced.
* Before/after on the reported root: `0 rows` + two `not-ai-output` exclusions →
  `2 rows`, no exclusions, audit `5 files · 2 AI sources · 2 references
  excluded · 0 missing files · 0 duplicates removed → 2 rows`.

## 6. Rejected alternatives

* **Keep `not-ai-output` and let the user re-approve in Selection.** The record
  already says "approved"; asking the user to approve the same reference again
  because the AI image arrived is the bug, not a workflow. (The Selection tab
  does carry the decision in-session through `reviewfile.carryRenamed`'s
  identity keys, which is exactly why this only shows up on a cold read.)
* **Match the reference approval to *every* pair sharing that reference.** It
  would list images the user never approved (a declined variation beside an
  approved reference) and make the row set depend on how many variations happen
  to exist. The owner rule is one deterministic pair.
* **Upgrade the stored record** (rewrite `pair_id`/`ai_result` on read). A scan
  writes nothing (D5 of `2026-10-05-recursive-scan-determinism`), and the record
  is the user's decision, not a cache. The upgrade already happens by itself the
  next time the Selection tab saves that pair.
* **Match by identity key (`size:mtime`) instead of path.** The path is what the
  record stores and what the row is; the identity key needs a previous pair set
  that a cold read does not have, and it changes whenever the file is touched.
* **Widen pairing so a reference with a different extension still pairs** (e.g.
  `icon.png` beside `icon_AI_8_01.jpg`). A real gap, but a different one: it
  changes the Selection list for every folder, and the reported paths are all
  `.png`. Left as a follow-up, not smuggled into this fix.
* **Also rewrite the stored record when a pair inherits a reference approval**
  (the "record follows the pair" idea: new `pair_id`, new `ai_result`). It would
  close the one hole rule 3 leaves — a pair the user *reset* in Selection after
  inheriting the approval in-session keeps the stale reference record as an
  orphan (`orphanOnly` keeps every record whose id is not a current pair), so a
  reload lists it again — and it would make the two tabs agree on a cold read.
  But it means `selection/state.ts` deciding pairs on load, a much wider blast
  radius than the reported bug, and a reset deliberately leaves no trace (I-13:
  a pair back to pending owns no record), so the hole cannot be closed from the
  SVG side alone. Recorded here as the known boundary, not fixed here.

**Known boundary (accepted):** a pair that was approved through a reference
record and then *reset* in Selection is listed again on the next cold read,
because a reset leaves no record to contradict the older approval. Everything
else — approve, decline, re-approve, delete the AI image, move the folder — is
decided by the pair's own record, which outranks the reference approval.

## 7. Invariants

* **I-35 (approval, RULE 3/6/24):** an approval is of the **files**, not of the
  derived pair id. A pair on disk is approved by a record that names its own id,
  its AI path, or — when the record was written before the AI image existed —
  its reference path; the reference path approves exactly the pair that owns it,
  and a record naming the pair's AI path is that pair's authority. So an AI image
  that appears beside an approved reference is listed, and a reference whose AI
  image is still absent is still reported (`not-ai-output`) rather than listed.

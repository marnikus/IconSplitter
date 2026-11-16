# Accept metadata for selected icons — plan before implementation

User withdrew the Windows research/export task: missing metadata confirmation
explains their files. Preserve supplied fixtures; shelve only our unfinished
Windows changes outside the repository. No Windows feature ships in this task.

## Steps and acceptance

1. Add failing real-panel tests for a global Accept metadata button next to
   Generate/Regenerate. Its count covers checked drafts and accepted-but-edited
   fields, not empty/unchanged accepted/pending rows. Disable without candidates
   and while metadata/export work is running.
2. Reuse ONE clean/validate/cache/dispatch/log acceptance gate for row Accept
   and bulk Accept. Only selected IDs change; no AI request, no generation or
   implicit paid consent. Invalid metadata stays unaccepted with exact errors;
   empty/already accepted rows are skipped. Summary reports actual outcomes.
3. Accept valid drafts in memory/cache and preserve user identity. For existing
   exports, pass all new accepted states to ONE sequential re-export batch,
   preventing React snapshot races and overlapping per-row batch runners. Never
   export new/unexported rows merely to accept their metadata.
4. Cover mixed valid/invalid/empty/unchecked states, edited accepted values,
   cache/reload, pre-existing two-file re-embedding and no extra model calls.
5. Update metadata behaviour and selector docs, run focused and sequential
   fast/full gates, append measured ledger without reading, scoped commit/push.

## Results

Implemented and verified on 2026-10-22. Three real-panel tests cover
both pre-existing packages re-embedded, untouched unchecked draft before/after
reload, preserved/edited identity, invalid/empty rows, disabled busy/cancel and
no extra paid calls. Twelve domain/guard cases cover eligibility and blocked
invocations. The reload test exposed sibling export.json acceptance bleed;
restoration now uses a record only for its owning pair's metadata. TDD witnessed
initial missing-button failures and the reload failure before fixes. Windows
work remains shelved outside the repository; no EXIF/PowerShell code included.


Verification: 135 focused tests / 6 files passed. `verify:fast` all5 lanes
passed; `verify` all6 lanes passed sequentially: 2494 tests / 234 files,
97.99% overall line coverage; native5 files /30 tests pass. Full timings:
types13.8s/lint10.9s/quality0.6s/native2.5s/coverage182.4s/build7.0s.
No live provider calls; only stub transports in UI tests. New bulk action has
no provider dependency. Current docs/handles updated; generated dist, withdrawn
Windows work and user fixture files excluded from this feature's commit.

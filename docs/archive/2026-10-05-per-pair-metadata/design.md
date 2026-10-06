# One JSON per image pair: the pair's approval and its SVG history (2026-10-05)

The reported gap, verbatim:

> **3. GENERATE SVG**
> • Discover approved AI images through each pair JSON.
> • Store SVG versions, generation state, review, tokens, and cost in the same
> per-pair JSON.
> • No global SVG metadata JSON. Store important information (approved SVG or
> not and etc.) about generated SVG in local `.json` file in each folder with
> images pair

and the symptom that made it concrete: *"i dons see json in local folder contain
information about SVG aproval. only AI image aproval"* — looking in the folder
that holds the image pair, the JSON there says nothing about the SVG.

## 1. Why the local JSON only showed the AI-image approval

Today there are **two** decision stores, and they answer different questions:

| Question | Today's answer | Where |
|---|---|---|
| May this AI image be generated from? | `decision` | `<root>/review-decisions.json` — **one global file for the whole picked tree** |
| Is this SVG approved? | `versions[].review` | `<stem>.svg.json` beside the AI image — one file per pair |

So the file *in the pair's folder* is only written once an SVG exists, and it
holds the SVG's own review; the AI-image approval never reaches it (it lives at
the root, far from the images, and a copied or moved folder loses it). A user
who opens the split folder after approving pairs sees either no JSON at all (no
SVG generated yet) or a JSON that mentions only the SVG version — never both
approvals together, never in the folder the pair lives in. The second bullet —
"no global metadata" — is only half true today: the SVG metadata is per-file,
but the pair's own approval is global.

## 2. The contract (the fix, in one file per pair)

**One local JSON per image pair, in the folder that holds the pair** — the file
name stays `<AI stem>.svg.json` (the name it has always had beside the images,
so no history is renamed or lost). It carries *both* approvals and the whole SVG
history:

```jsonc
// _split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01/icon-sheet_AI_01.svg.json
{
  "v": 2,
  "pair": { "id": "pair_1f3c9a20", "base": "icon-sheet", "suffix": "_01", "dir": "…/split_01" },
  "source": { "relPath": "…/split_01/icon-sheet.png",      "name": "icon-sheet.png",      "fingerprint": "12:910" },
  "ai":     { "relPath": "…/split_01/icon-sheet_AI_01.png", "name": "icon-sheet_AI_01.png", "fingerprint": "20:960" },
  "decision": "approved",           // the AI image: pending | approved | declined
  "reviewedAt": "2026-10-05T17:02:11.000Z",
  "versions": [
    {
      "version": 1, "svgPath": "…/split_01/icon-sheet_AI_01.svg",
      "status": "generated",        // generated | failed | interrupted
      "review": "approved",         // the SVG: pending | approved | declined
      "prompt": "…", "provider": "requesty", "model": "openai/gpt-5",
      "requestedAt": "…", "completedAt": "…",
      "usage": { "input": 3100, "output": 5200, "total": 8300 },
      "cost": { "actual": 0.0123, "estimated": null, "currency": "USD", "pricing": "requesty-2026-08-01", "basis": "provider" },
      "validation": { "ok": true, "errors": [], "warnings": [], "icons": 1 },
      "batch": { "batchId": "…", "position": 0, "compositeHash": "…", "manifest": "…" },
      "error": null, "requestId": "…"
    }
  ]
}
```

Rules:

* **Discovery reads the pair files.** Generate SVG lists a source exactly when
  the AI raster exists **and** the pair file beside it says `decision:
  "approved"` — the same rule as today, with the record now living next to the
  images it is about (I-31 is unchanged; only the record's home moves).
* **The pair file is the pair's identity.** It stores `pair.id` (so a match
  never depends on a path guess), its base/suffix/dir, both image faces, the
  decision, and one record per SVG version with status, review, tokens, cost,
  prompt, model, timestamps, validation and the redacted error.
* **No global file is written any more.** `review-decisions.json` is legacy: it
  is still **read** (never written, never deleted) as a fallback for pairs that
  have no local file, so no approval disappears on the first run of this build
  (I-42). The first write for a pair creates its local file, which then wins —
  including an explicit `"decision": "pending"`, so a reset can never be
  resurrected by the legacy file.
* **A scan still writes nothing** (I-22): it walks, reads the pair files it
  finds, and commits one snapshot. Reading N small JSONs replaces reading one
  big one; ordering is by pair id, so the snapshot is deterministic.
* **Every writer preserves the other half.** `withVersion` takes and returns the
  whole pair file, so a generation can never drop the pair's `decision`, and an
  approval can never drop the SVG history.

### 2.1 File name and location

* Normal case: the file sits beside the pair, named after the **AI image stem**
  (`icon-sheet_AI_01.png` → `icon-sheet_AI_01.svg.json`) — unchanged from today.
* A pair whose AI image is missing (reference-only) gets the name the AI image
  would have: `<base>_AI.svg.json` in the pair's folder.
* A legacy file (`v: 1`, the old sidecar shape with `source` = the AI image) is
  read as this pair's file: its `versions` are kept, `ai` comes from the old
  `source`, the reference face and the pair identity are derived from the stored
  AI path + name (`parseAiName` + `pairId`), `decision` starts absent (pending).
  It is upgraded to v2 on the next write for that pair.

### 2.2 Failure policy (never lose a decision, never fake a save)

* **Read:** an unreadable or unparsable pair file is named in the scan report
  (`N pair file(s) could not be read: …`) and the previous in-memory decisions
  are kept — a file that cannot be read is never evidence that a pair is
  pending (the rule the global file's `corrupt` flag already followed).
* **Write:** one file per touched pair, each through tmp → read-back verify →
  overwrite → cleanup. A bulk decision reports the pairs whose file could not be
  written, keeps their decisions in memory, and `Retry` rewrites exactly those
  (never a blanket rewrite that could hide a lost pair).

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/pairmeta.ts` | **new, pure**: the v2 model, parse (v2 + legacy v1), serialize, `toRecord`, `withDecision`, `newPairMeta`, the file-name/locator rules | ~210 |
| `src/lib/svgfile.ts` | keeps the *version* model; the container moves out; `parseVersion` exported | 276 → ~225 |
| `src/selection/pairstore.ts` | **new** (replaces `reviewstore.ts`): read every pair file of a walk + the legacy file, build the record set, write ONE pair's file, locate a file from a record | ~160 |
| `src/selection/offline.ts` | the cross-tab apply writes per-pair files instead of rewriting a global one | 60 → ~70 |
| `src/selection/rootsource.ts` | the scan loads the pair store from the walked entries | 120 → ~132 |
| `src/selection/useSelection.ts` | per-pair writes, failed-id retry, new wording | 232 → ~245 |
| `src/selection/state.ts` | `ScanLoad.corruptFiles`, `SelState.retryIds` | 218 → ~225 |
| `src/selection/Surfaces.tsx` | the write-warn/corrupt wording names pair files, not one file | ~45 |
| `src/svg/sources.ts` | discovery reads the pair store; exposes the metas + corrupt files | 143 → ~160 |
| `src/svg/scan.ts` | rows come from the discovery's metas — no second read of each file | 130 → ~125 |
| `src/svg/sidecar.ts` | the per-pair file reader/writer (typed `PairMeta`) | 80 → ~88 |
| `src/svg/{saveversion,reviewact,reviewundo,rowmodel,types,runtypes}.ts` | `SvgSidecar` → `PairMeta`; every version write carries the pair half | small |
| `src/svg/SvgPanel.tsx` | wording: the pick hint names the pair files, not the legacy file | small |

## 4. TDD order (red before green, per cycle)

1. `tests/pairmeta.test.ts` (**new**): v2 round-trip; legacy v1 read keeps the
   versions and derives pair/source from the stored AI face; `toRecord` (pending
   ⇒ no record); `withDecision` keeps versions; junk ⇒ not ok; unknown fields
   dropped; the file name/locator rules incl. the reference-only case.
2. `tests/pairstore.test.ts` (**new**, fakes): reads every pair file in a walk
   (deterministic order by pair id); a corrupt file is named and does not lose
   the others; the legacy global file still supplies decisions for pairs without
   a local file; a v2 file wins over the legacy record — even `pending`; the
   write is one file, tmp → verify → overwrite → cleanup; a failing write
   throws; `metaPathFor(record)` locates the file from the record's paths.
3. `tests/selection_scan.test.ts` (extend): decisions come from pair files; the
   legacy file still works; a renamed pair keeps its decision (identity carry);
   a corrupt pair file keeps the previous decision + names the file.
4. `tests/svg_sources.test.ts` (extend): a row is listed from the pair file's
   `decision: approved`; the row's versions come from the same read; the legacy
   fallback still lists; a pair file with `decision: declined` is not a row.
5. `tests/selectionv2_ui.test.tsx` (extend): approve a pair in the real panel →
   its folder gains `<AI stem>.svg.json` with `decision: approved` and **no
   `review-decisions.json` is created**; a failed write names the pair + Retry.
6. `tests/svg_io.test.ts` / `svg_cost_io.test.ts` / `svg_extract.test.ts`
   (retarget): generation and SVG review write `versions[]` into the same file
   and never drop `decision`.
7. `tests/offline.test.ts` + `tests/history_integration.test.tsx`: the
   cross-tab undo writes the pair file (no global rewrite).
8. Docs (`SYSTEM_OF_RECORD`, `UI_SELECTORS`, `README`, `docs/README`), `npm run
   verify`, the headless-Chromium probe.

## 5. Verification

* `npm run verify` (6 lanes) + `npm run quality:changed` (RULE 16/18).
* The probe (real OPFS handles, so the tree survives IndexedDB): approve pairs
  in Selection V2 → read the folder from the page and assert the pair file
  exists with `decision: approved`, that the root has **no**
  `review-decisions.json`, and that Generate SVG lists exactly those rows; then
  approve the SVG from the row and assert `versions[0].review: approved` in the
  same file; a corrupt pair file is reported and the decision is kept.

## 6. Rejected alternatives

* **Rename the file to `.pair.json`.** The browser has no rename; migrating a
  name means write-new + delete-old per pair, and a failure between the two
  leaves two half-truths. The file already sits in the right folder under a name
  the user knows; only its content grows.
* **Delete `review-decisions.json` after migrating.** Deleting a user's file is
  not a migration. It is left in place, read-only, for the one release that
  needs it; nothing in the app depends on it afterwards.
* **Write the pair files during the scan (an eager migration).** A scan that
  writes breaks I-22 ("a scan must not mutate the folder it scans") and would
  rewrite every pair's file just to change its version number.
* **Keep the global file as the primary store and mirror it locally.** Two
  sources of truth for one decision is exactly how the reported confusion
  happened (which file has the truth?); one file per pair, one place to look.
* **One file per folder holding every pair of that folder.** A folder can hold
  several pairs (a sheet and its pieces); a shared file makes one pair's write
  risk another pair's record.

## 7. Invariants

* **I-41 (one file per pair, RULE 3/13):** a pair's metadata is a single JSON in
  the folder that holds the pair, named after the AI image's stem
  (`<stem>.svg.json`). It stores the pair's identity, both image faces, the
  pair's `decision` (may this AI image be generated from?), and one record per
  SVG version with `status`, `review` (is this SVG approved?), prompt,
  provider/model, timestamps, tokens, cost + basis + pricing version, validation
  and the redacted error. No global file holds any of it.
* **I-42 (the migration is read-only, RULE 13):** `review-decisions.json` is
  read as a fallback for pairs that have no local file and is never written or
  deleted by this build. A scan writes nothing. A legacy `<stem>.svg.json`
  (v: 1) keeps its versions, gets the pair identity derived from its stored AI
  face, and is upgraded on the next write. A local file always wins over the
  legacy record — including an explicit `pending`.
* **I-43 (a decision survives the tree, RULE 12/24):** because the record lives
  with the images, an approval travels with a renamed or moved folder; when the
  images are gone the file still reports the pair (`files-missing`); an
  unreadable pair file is named and the in-memory decision is kept, never
  silently turned into `pending`; a failed write keeps the decision in memory
  and `Retry` rewrites exactly the pairs that failed.

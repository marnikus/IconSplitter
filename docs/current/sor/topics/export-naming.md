# Export naming context

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## Export naming (2026-10-08, `export-naming`)

The user's rule (corrected the same day): *"only remove `_AI` but keep numbers,
`_03` etc."* A destination site must see the icon, not the app's marker, so the
artifact name is `stemOf(row.svgName)` from `lib/upload/export.ts`:

* strip the extension, then the `_AI` marker **and nothing else**;
* `fog_AI.svg` → `fog.svg` / `fog.jpg` / `fog.eps`; `fog_AI_03.svg` → `fog_03.*`;
* `icon-bunny-face_AI_7_04.svg` → `icon-bunny-face_7_04.*` (batch + split tails);
* `fog_AI_v2.svg` → `fog_v2.*` — the approved version stays visible in the name;
* `chat_bot_2_AI.svg` → `chat_bot_2.*`;
* no trailing `_AI` marker, or a non-numeric tail (`fog_AI_x.svg`), comes back
  unchanged — the name is never invented, only trimmed.

Keeping the digits is also what keeps two icons apart: `fog_AI.svg` and
`fog_AI_7.svg` are different pairs and export as `fog.*` and `fog_7.*`.

One rule, one home: `runexport.ts` no longer keeps a second private `stemOf`
(RULE 3/16.4), and `publishedJpegPath` (the Location action's path and the
export-path cell) derives from the same function, so the record, the file and
the UI cannot disagree.

**The folder's superseded artifacts are swept once the write is verified**
(`src/upload/exportsweep.ts`, own test suite). A folder exported before the
2026-10-08 naming change still carries the OLD artifacts — typically the EPS
(`fog.svg` + `fog.jpg` + `fog_AI.eps`) — and the user asked for the package to
end up under ONE name. After the new files are written and verified, and only
then, the sweep removes **what this app provably wrote and no longer writes**:

* candidates are only the icon's three artifact extensions whose bare name trims
  to **this icon's stem** under the very rule that produces the current names
  (`trimArtifactStem`), and which are not already `${stem}.${ext}` — so
  `export.json`, a readme, another icon's `arch_AI.svg` and every number-tailed
  name that belongs to a DIFFERENT icon (`fog_AI_7.eps`, `fog_AI_9_01.jpg`) are
  never candidates; near-misses (`fogv2.eps`, `fog_AI_x.eps`) are not either;
* a candidate the previous `export.json` still **names** goes only when the
  current artifact of that kind is on disk — an EPS stage that failed leaves the
  previous EPS alone rather than deleting the only copy of it;
* a candidate **no record names** is an orphan (the app lost track of it, no
  package claims it) — that is what a failed-then-recommitted EPS looks like, and
  it goes;
* `*.tmp` leftovers are left to the commit that owns them: the sweep does not
  guess.

The removals are reported in the run's result (`replaced`) and the record is
kept honest on both sides: it stops naming a file that was just removed, and it
KEEPS naming the files this run did not rewrite (`assembleRecord` seeds
`outputs` and the JPEG block from the previous record) — a selective re-export
used to blank the record's entries for everything it skipped.

Assumption recorded: one icon per export folder (the user's own tree — the
batch layout puts one piece per `split_NN` folder). Two paired sources whose
bases trim to the same name in the SAME folder would share one package; that
case is not in the corpus and would be caught by T28 when it lands.

### One stem for all three artifacts (why the EPS can never be named differently)

`commitExport` writes exactly four names into `export/` — `${stem}.svg`,
`${stem}.jpg`, `${stem}.eps` and `export.json` — and all three artifacts take
`stem` from the same `plan.stem` (`stemOf(row.svgName)`), so within one run the
EPS can never carry a different name than its siblings; the EPS's own
`%%Title` is `${stem}.eps` for the same reason. A differently-named `.eps` in a
folder can therefore only be a file no export of the current naming wrote: a
leftover from before the rename. The sweep removes such a leftover in both
shapes: named by the icon's own previous `export.json` (when the current EPS is
on disk), or an orphan no record names — an orphan still has to pass the naming
rule that proves the app wrote it, so a foreign file is never a candidate.

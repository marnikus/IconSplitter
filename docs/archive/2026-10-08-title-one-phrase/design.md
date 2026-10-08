# One-phrase titles — no second sentence, no trailing period (2026-10-08)

Source: the stock-submission review of one exported SVG. The reviewer saw

```xml
<title>Collaborative Unity Promoting Collective Social Empathy. Icon of charity and community.</title>
```

and answered with Adobe's title guideline: *"Max ~200 chars, but should be one
clean descriptive phrase · No trailing periods · No duplicate concepts
("charity" and "community" are already in keywords)"*, plus the corrected title
they would ship — the first sentence alone.

Scope: the metadata title only — `src/lib/upload/meta.ts` (the default prompt and
`cleanTitle`), the four gates a title enters by, and the Title field's hint in
`src/upload/UploadMetaFields.tsx`. The description keeps its "one or two
sentences": the stock rule quoted is about titles.

## 1. The report, measured against the code

| Fact | Where it lives | Verdict |
|---|---|---|
| A model answer may carry two sentences in the Title line | Nothing cut a sentence: `cleanTitle` stripped only *trailing* punctuation (`TITLE_TAIL`), and `validateMetadata` counts words, never structure — two sentences pass every rule | Real gap |
| The Title field **taught** the old shape | `UploadMetaFields` hint read *"two sentences: 5–7 words, then 3–5 words naming two of the tags"* — a leftover of the superseded 2026-10-06 prompt policy | Real gap |
| A saved package kept its old title in the field | `rowmodel.metaFromRecord` copied the record's `metadata.title` verbatim — not one of the three gates the 2026-10-08 trailing-period rule cleans | Real gap |
| The trailing period was already handled | `cleanTitle` at parse, cache read and Accept | Already fixed (same review, earlier commit) |

The cleanTitle rule of record before this change: *"a title never ends in
sentence punctuation — `.`, `!`, `;`, `:`, `,`, `…` gone, `?` kept"*.

## 2. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | What happens to a second sentence? | **It is cut.** The title is the text before the first sentence break — an end mark (`.` `!` `?` `…`) followed by whitespace and more text. A title with no such break is untouched (except the existing tail strip and whitespace collapse). | The reviewer's own "better" version is sentence 1 alone, and sentence 2 in the report is a restatement of the tags. Joining the sentences instead ("…empathy, icon of charity and community") would keep exactly the duplicate concepts the guideline flags. One rule: *the title is ONE phrase.* |
| D2 | Is a cut ever a refusal? | **No new rule, no new error.** `validateMetadata` is untouched; a first sentence under 5 words still reports the existing, actionable `title must be at least 5 words (got N)`, and the prompt now asks for one phrase of at least 5 words — a model that writes "Growth. Icon of …" produced an answer no stock title can use, and the user sees exactly why. Nothing is silently joined into something the validator would wave through. | The minimum policy stays a minimum policy; the sentence rule is a *shape* rule, and shape is normalized, never refused (same treatment as the trailing period). |
| D3 | Where does the cut happen? | **At every gate, now four:** `parseMetadata` (the model's answer), `restoredMeta` (the accepted-metadata cache on read), `acceptOne` (the Accept button, i.e. the user's edit), and — new — `metaFromRecord` (the committed `export.json` block a reload reads back). | The last one is why a package exported before this rule still showed its two-sentence title: the field, the file and the XMP must agree (RULE 24). A pre-fix record now reads back cleaned **and no longer matches its stored metadata fingerprint**, so the row reports `stale` and the next export re-embeds without paying for a model call — the fix reaches packages that already exist. |
| D4 | What does the prompt say? | The Title line and its hard rule: **ONE phrase, at least 5 words, a single sentence — never a second one, no `.` `!` `?` `…` inside it or at the end, and no "Icon of X and Y" restatement of the tags** (the tags already carry those words). The description line keeps "one or two sentences". | The prompt states the rule the code enforces; the tags/keywords note is the reviewer's "no duplicate concepts" made actionable for the model. |
| D5 | The field's hint | *"one phrase, at least 5 words — no second sentence, no trailing period"*. | RULE 10: the hint must describe the rule that is enforced, not the retired one. |

Deliberately NOT done: a character cap (the reviewer quotes Adobe's ~200 chars,
but the policy here is minimums-only — nothing is refused for being longer, and
`cleanTitle` does not invent a maximum the validator would not enforce); case
rewriting (the reviewer's lowercase "unity" is their typing, not a rule — the
title's casing is the model's and the user's); a join/repair fallback (§D2); and
touching the description.

## 3. What changes, by owner

* `src/lib/upload/meta.ts` — `cleanTitle` = collapse whitespace → cut at the
  first sentence break → strip the trailing sentence punctuation. Two small
  helpers (`flatTitle`, `stripTail`) and one constant (`SENTENCE_BREAK`); the
  prompt's Title line and Title hard rule. `validateMetadata`,
  `metadataFingerprint`, `dedupeTags` untouched.
* `src/upload/rowmodel.ts` — `metaFromRecord` runs the record's title through
  `cleanTitle` (the fourth gate).
* `src/upload/UploadMetaFields.tsx` — the Title hint.

## 4. Tests (RULE 8 — the real functions, the report's exact strings)

* `tests/upload_meta.test.ts` — the review's title
  (`"Collaborative Unity Promoting Collective Social Empathy. Icon of charity
  and community."` → `"Collaborative Unity Promoting Collective Social
  Empathy"`), `"Growth. Speed and growth pictogram"` → `"Growth"`, three
  sentences → the first one, a title with a number (`"3.5 MP …"`) is NOT split,
  the trailing-period table kept, the walk-back (`cleanTitle` is idempotent),
  and the prompt now states the one-phrase rule; `parseMetadata` cuts
  end-to-end.
* `tests/upload_rowmodel.test.ts` — a committed record whose block holds a
  two-sentence title reads back as the first sentence, and that row is `stale`
  against its own record (the pre-fix package case).
* `tests/upload_ui.test.tsx` — typing a two-sentence title and accepting shows
  the cut title in the field at once (RULE 24), and the shipped SVG carries it.
* Fixtures across the metadata suites stop using a two-sentence title
  (`"Minimal line icon of growth. Speed and growth pictogram"` →
  `"Minimal line icon of growth and speed"`): a test must not pin a shape the app
  no longer produces.

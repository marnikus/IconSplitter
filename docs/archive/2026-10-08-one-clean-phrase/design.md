# One clean phrase — title and description (2026-10-08)

## 1. The problem

The stock reviewer's file (after the no-trailing-period rule of `9eb819a`):

```xml
<title>Collaborative Unity Promoting Collective Social Empathy. Icon of charity and community.</title>
<dc:title>Collaborative Unity Promoting Collective Social Empathy. Icon of charity and community.</dc:title>
```

Wanted, for the title AND the description:

```xml
<title>Collaborative unity promoting collective social empathy</title>
```

Three things are wrong, and `cleanTitle` only addressed the third:

1. two sentences — the model appends a second one ("Icon of charity and
   community.") and the first period is not trailing, so it survived;
2. Title Case — every word capitalised; the reviewer wants sentence case;
3. a trailing period — stripped at the gates since `9eb819a`, but a file
   exported before that rule, or an edit typed after it, still carried one.

The description has the same shape ("…sentence. Second sentence.") and the
same rule now applies to it: one phrase, no end punctuation.

## 2. Decisions

* **D1 — one cleaner, `cleanPhrase(text)`, for both fields.** Deterministic:
  whitespace collapsed; cut at the FIRST sentence break (`.`, `!`, `?`, `;`,
  `…` followed by whitespace and more text — a period inside a number or
  between letters, `2.5`, `e.g.`, is not a break); the tail punctuation rule
  of `cleanTitle` (a `?` stays — a question is a phrase); then sentence case.
* **D2 — sentence case, acronyms kept.** The first character is upper-cased;
  every later word that is *Capitalised* (one upper, the rest lower) is
  lower-cased; a word with two or more capitals (`SEO`, `3D`, `iOS`-style
  mixed case) is left alone. The model is also told, so the cleaner is a
  guard, not the author.
* **D3 — the same gates as before, now for both fields:** `parseMetadata`,
  the accepted-metadata cache on read, the Accept button (an edit) and — from
  the parallel `title-one-phrase` session merged here — the committed
  `export.json` block a reload reads back (`metaFromRecord`). A
  `cleanMetadata(meta)` helper applies it to both so no gate can clean one
  field and forget the other. `cleanTitle` is deleted — one name, one rule.
* **D4 — the minimums stand.** A title cut to fewer than 5 words, or a
  description to fewer than 7, fails validation exactly as a short answer
  always has (the row says why; generate again or edit). Nothing is padded.
* **D5 — the prompt asks for what the cleaner enforces:** Title and
  Description are each "ONE phrase, sentence case, no period or other end
  punctuation, no second sentence". The validator's text is unchanged.
* **D6 — the fingerprint moves with the text.** `metadataFingerprint` is
  over the cleaned fields, so a remembered answer that the cleaner changes
  shows the row stale and the next export re-embeds — no silent old file.

## 3. Owner files

| File | Change |
|---|---|
| `src/lib/upload/meta.ts` | `cleanPhrase`, `cleanMetadata` (replace `cleanTitle`), prompt text |
| `src/upload/metaactions.ts`, `src/upload/metacache.ts` | call `cleanMetadata` |
| `tests/upload_meta.test.ts` | the cleaner's table, parse applies it to both, prompt asks |
| `tests/upload_ui.test.tsx` / `upload_metacache` | accept + restore clean both fields |

## 4. Steps (TDD)

| # | Red | Green |
|---|---|---|
| 1 | `upload_meta`: `cleanPhrase` table — the reviewer's title → the reviewer's phrase; description likewise; acronyms kept; `2.5` not a break; question kept; `parseMetadata` cleans both; prompt says "ONE phrase" | `meta.ts` |
| 2 | accept/restore gates clean the description too | `metaactions.ts`, `metacache.ts` |
| 3 | gates, docs, commit | — |

## 5. As built (2026-10-08)

Merged with the parallel session's `title-one-phrase` commit (`92513f1`):
its fourth gate (`metaFromRecord`) and its "no 'Icon of X and Y'
restatement" prompt line stay; its title-only `cleanTitle` (no sentence
case, no description) is replaced by `cleanPhrase`/`cleanMetadata`.

As designed, plus two things the research turned up: the title field's hint
literally asked for "two sentences: 5–7 words, then 3–5 words naming two of
the tags" (replaced), and the shared test fixture title was itself two
sentences (replaced by one phrase in every upload test). The sentence break
is the whitespace after end punctuation that follows a word of 2+ letters
(`(?<=\p{L}{2}[.!?;…]+)\s+(?=\S)`), which keeps `2.5` and `e.g.` whole and
keeps a `?` on a question. The shipped `<title>`, `<dc:title>` and `<desc>`
are pinned in `upload_runexport`.

# Upload metadata and provider confirmation

Only explicit confirmation sends the displayed prompt/input to Gemini; export remains local. Start from [upload behaviour](upload.md).

## Prompt and response

* The metadata prompt (2026-10-07 UI fix): it lives in its OWN large panel
  beside the Gemini card — never inside it — and it is EDITABLE and persisted
  (`iconSplitter.upload.prompt.v1`): the text the editor shows is the text the
  one confirmed request carries, the text the confirmation dialog previews, and
  the text the export record names (honesty: one prompt, one owner). Presets are
  named snapshots under `iconSplitter.upload.prompts.v1` with their own row —
  the saved list, Quick load, Delete, and Save as with a name field (a new name
  goes first, an existing one is replaced in place; max 50, names 1–60 chars,
  text ≤ 8000 chars, all validated on read). Editing the prompt never relaxes
  the POLICY: the validator keeps enforcing the rules the default prompt states,
  and the panel says so out loud.
* Metadata: Gemini (`gemini-3.1-flash-lite`, `x-goog-api-key` header, key in
  IndexedDB under `gemini-api-key`, masked/redacted everywhere) answers the
  prompt above (the documented default until the user edits it); the answer is
  parsed deterministically (three labeled
  lines) and validated against a MINIMUM policy (2026-10-07, "no need be
  strict"): at least 10 unique tags — case-insensitively unique, and the list
  must still contain the 7 mandatory terms — a title of at least 5 words and a
  description of at least 7 words, where a hyphenated compound counts as ONE
  word; nothing is refused for being longer, and duplicates or a missing
  mandatory term are errors. IP-claim phrases and restricted-content hits are
  warnings only — they never block the accept (the prompt forbids them).
  Errors are verbatim and actionable (`tags must be at least 10 (got N)`,
  `title must be at least 5 words (got N)`, `description must be at least 7
  words (got N)`, `missing mandatory tags: …`). 2026-10-08: duplicates are
  removed SILENTLY before validation — case-insensitively, first spelling kept,
  order kept, blanks dropped (`dedupeTags`), and the ≥10 minimum counts the
  DEDUPED list, so a tag written twice is never a refusal or a warning. The
  fields
  under each row are editable and copiable, empty until generated; Accept
  re-validates and persists through the embed commit. The confirmation dialog shows the exact
  request (prompt, endpoint, auth rule) before any paid send; a timeout or
  disconnect is NEVER resent automatically (no duplicate paid submission);
  in-flight requests are journalled and reported `interrupted` after a restart.
  The bulk bar keeps **Generate metadata** (selected rows whose metadata is
  null) separate from **Regenerate metadata** (selected rows whose metadata is
  non-null). Regeneration's count and confirmed preview include only existing
  answers; a returned answer replaces that text but is never auto-accepted —
  review it and pass validation before Accept. Provider failure leaves the
  previous text. Empty rows are never part of this
  regeneration batch; `Export selected` remains unchanged.

## Accept metadata for the selection

The global **✓ Accept metadata (N)** button beside Generate/Regenerate accepts
existing metadata on checked icons only, including selected icons hidden by a
filter. N counts drafts, fixable invalid drafts and accepted-but-edited fields;
empty, pending/interrupted and unchanged accepted rows are excluded. The button
is disabled at zero and while a metadata/export run or other busy work is active.

It uses the SAME clean → validate → accept/cache/log gate as each row's Accept.
Valid metadata becomes accepted; invalid metadata stays unaccepted with its exact
validation errors. Empty/already accepted rows are skipped. The outcome line
reports accepted, invalid and skipped counts. There is no AI request, no new
metadata generation, and no additional paid confirmation.

Accepting unexported rows stores their metadata without creating files. Rows
with existing packages are re-embedded together through ONE sequential export
batch, carrying the newly accepted states directly rather than waiting for a
React render. This prevents parallel per-row runs from skipping selected files.
User-entered Creator/Copyright survive, and edited accepted fields can be
accepted again. Acceptance persists in cache/export records through reload;
a sibling pair's shared-folder record cannot make an unchecked row accepted.

## Optional user identity

Creator and Copyright inputs appear below each row’s generated metadata. They
are optional explicit user claims, not Gemini output. Accept persists them in
the cache and export record; reload and regeneration retain them. Clearing and
accepting removes them from subsequent exports. Editing either field re-embeds
accepted SVG/JPEG/EPS metadata without re-rendering JPEG pixels or calling AI.
[File metadata](upload-file-metadata.md) defines XMP/IIM mappings and byte limits.

## Title and description normalization

* Metadata title AND description (2026-10-08, stock review; corrected the
  same day — the first version CUT the second sentence, which lost the
  model's words): clean text — `cleanPhrase` keeps the WHOLE text, every
  sentence, strips only the END punctuation `.`, `!`, `;`, `:`, `,`, `…` (a
  `?` stays: a question is a phrase; punctuation between sentences stays) and
  writes sentence case per sentence (each sentence's first letter up — a
  sentence starts after `.`/`!`/`?` + space following a word of 2+ letters,
  so `2.5`, `e.g.`, a `;` and an ellipsis do not start one — every later
  Capitalised word down; `SEO`, `iOS` and a lone `A` untouched). "Collaborative
  Unity Promoting Collective Social Empathy. Icon of charity and community."
  ships as `<title>Collaborative unity promoting collective social empathy.
  Icon of charity and community</title>` (and the same text in `<dc:title>`). `cleanMetadata` applies it to both
  fields at every gate the text passes: the model's answer
  (`parseMetadata`), the accepted-metadata cache on read, the Accept button
  (an edit) and the committed `export.json` block a reload reads back
  (`metaFromRecord`); the fingerprint is over the cleaned text, so a
  remembered or exported answer the rule changes no longer matches its stored
  fingerprint — the row shows stale and the next export re-embeds the file
  without a model call. It is a SHAPE rule, never a refusal, and it never
  removes words. The prompt still ASKS for one phrase ("ONE phrase … sentence
  case, no period") for both lines; an answer that comes back as two sentences
  is kept as written, minus its final period.

## Confirmation and model check

* The confirmation shows the image it sends (2026-10-07): the metadata dialog
  renders, BEFORE anything is paid for, the very bytes the request will carry —
  one 512 px JPEG per selected icon, each read from that icon's OWN approved SVG
  and captioned with its file name (`upload-preview-{id}` +
  `upload-preview-caption-{id}`). The prepared data URL is bound to the pair id
  AND the SVG's `size:mtime` fingerprint (`lib/upload/sentpreview.previewFor`);
  the runner sends it unchanged when both still match and re-renders that icon's
  own document when they do not, so a stale or neighbouring icon's picture can
  never travel. `upload-meta-confirm` stays disabled until the previews are
  ready, the strip is bounded (24, `PREVIEW_LIMIT`) and says how many it left
  out, one unrenderable icon never costs the others their preview, and the
  caption reads "… · image/jpeg · 512×512 · N.N KB · sent unchanged". Both row
  previews (this tab and Generate SVG) now read their document through ONE hook
  (`svg/usesvgtext`), which returns a text only for the folder generation +
  path it was read for — a row can never paint another row's artwork.
* Model check (CP-8): the provider card can ask the provider's own model list
  (`GET {base}/models`, same `x-goog-api-key` header, same bounded request
  window) and reports found / missing / failed. The configured id is NEVER
  substituted from the answer; the outcome is logged once as `model-checked`.
  A truncated answer (`finishReason` `MAX_TOKENS`/`LENGTH`) is `invalid` with the
  provider's own reason and is never accepted, even when the half-written tags
  happen to parse.

Metadata/regeneration progress, cancellation and metadata-to-export handoff: [shared process progress](process-progress.md).

Embedded JPEG/EPS carriers, repair and independent upload test page: [stock file metadata](upload-file-metadata.md).

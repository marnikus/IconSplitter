# List search — one search in every tab (2026-11-04)

[Shared shell](shared.md) · [List state & sorting](list-state-sorting.md)

Every list tab has the same Search box, working the way Generate SVG's always
did: type a **file name, a folder or a status**, in any case. Several words
narrow the list — each word must appear in one of the row's fields (so
`split_01 declined` finds declined rows in that folder; `not generated`
finds `not-generated`). A word never matches across two fields.

## One rule, one field

- Matcher: `src/lib/textsearch.ts` — `matchesSearch(query, fields)`,
  `searchTerms`. Each tab only lists its searchable fields; the rule lives here.
- Field: `src/ui/SearchField.tsx` — labelled `type="search"` input
  (`aria-label` "Search by name, folder or status"); `look="svg"` or `"v2"`
  picks the tab's control family. No tab renders its own search input.

| Tab | Handle | Searchable fields |
|---|---|---|
| Batch folders | `batch-search` (new) | name, folder, path, processing status, review |
| Selection V2 | `v2-search` (new) | folder/name, reference file, AI file, decision |
| Generate SVG | `svg-search` | name, folder, `vN`, generation status, review |
| SVG to upload | `upload-search` | name, folder, `vN`, package status, metadata state (status new) |
| Upload | `stock-filter-search` | name, folder, title, tags, metadata state, approval (status new) |

The search text lives in each tab's existing filter state (persisted and
cleared exactly as before; "× Clear filters" empties it). Single sheets has no
row list, so it has no search box.

Because status words are searchable, a single letter matches more rows than
before (e.g. `o` matches every `not-exported` row) — type a fuller word.

## Tests

`textsearch_tabs.test.tsx`: the matcher; name/folder/status per tab; the shared
field; the new Batch and Selection V2 fields; no tab keeps its own input or
matcher.

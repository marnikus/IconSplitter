# SVG builder — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) >
class fragment (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## T. SVG builder — `src/builder/*` (verified 2026-11-07)

Prefix is `builder-`. The panel root carries `svg bld`, so the shared tab look applies
and `.bld-*` styles cannot leak into another tab.

Shell and source bar:

| Test id | Element | Notes |
|---|---|---|
| `tab-builder` | nav button, visible text `SVG builder` | after `tab-upload`, before `tab-stock-upload` |
| `builder-shell` | shell wrapper | `hidden` while another tab is open; the same node returns to the tab |
| `builder-panel` | panel root | a supported browser with no scan yet |
| `builder-panel-unsupported` | panel root | no File System Access API; carries `builder-unsupported` |
| `builder-unsupported` | note + `Try the folder picker anyway` | the browser cannot open folders |
| `builder-root-empty` | note + `builder-open-folder-empty` | supported, nothing picked |
| `builder-source` | source-bar container | the shared furniture |
| `builder-open-folder` | green `Open folder` | the one way in (I-44) |
| `builder-rescan` | `↻ Rescan` | hidden before a folder is picked; its label is the busy words |
| `builder-scope-copy` | text | "Approved SVGs only · recursive · N icons" / "no folder picked" |
| `builder-folder-path` | read-only path row | the picked folder's complete path (I-46) |
| `builder-audit` | text | one line: files · SVG files · approved · not listed · corrupt pair files · unreadable |
| `builder-toast` | `role="status"` line | one transient sentence; absent when there is nothing to say |

The library rail (P1):

| Test id | Element | Notes |
|---|---|---|
| `builder-library` | rail section, `aria-label="Approved icons"` | absent while no folder is picked |
| `builder-library-empty` | note | picked, but nothing approved: says how many pairs were not approved |
| `builder-search` | `type="search"` input | name, folder or tag |
| `builder-search-clear` | text button | resets search + folder chip together |
| `builder-facet-folder` | chip per folder, `aria-pressed` | toggles that folder; label `<folder> <count>` |
| `builder-icon` | row (one per icon) | `data-icon-id`; `title` carries path, version and tag source |
| `builder-icon-name` | row text | the pair's own name, separators opened up |
| `builder-no-match` | note | a filter matched nothing (never an empty rail pretending to be the library) |

Later phases add `builder-recipe-*`, `builder-recipe-*`, `builder-stage`,
`builder-artboard`, `builder-cell-{n}`, `builder-<section>-*` controls, `builder-export-*`
and `builder-meta-*`; each is added here in the same change that introduces it (RULE 17).

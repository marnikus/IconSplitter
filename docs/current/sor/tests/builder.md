# Tests — SVG builder

Owner index for `tests/*builder*`. Assertions here must fail if the production code is
deleted or a boolean inverted (RULE 8); the fake filesystem and pair helpers are the
shared ones.

| Area | File | Proves |
|---|---|---|
| Shell registration | `tests/workbench_ui.test.tsx` | `tab-builder` sits after `tab-upload`, opens `builder-unsupported` in a DOM without the File System Access API, and the shell node is parked (not re-created) on another tab |
| Session slice | `tests/session.test.ts` | `TAB_IDS` carries `builder`; `{ slots, locked, seed, recipe }` round-trips; junk costs one field, a junk slot becomes a hole in place, locks keep only placed ids |
| Documentation | `tests/docs_navigation.test.ts` | the router routes both `sor/builder` and `selectors/builder` |
| Library scan (P1) | `tests/builder_scan.test.ts`, `tests/builder_rows.test.ts`, `tests/builder_ui.test.tsx` | approved-only listing with reasons, `export/` and `builder/` never walked, folder-then-name order, tag source honesty, and the rail itself: picking fills it, search and folder chips narrow it, an empty library explains itself, an unsupported browser shows no rail |
| Layout (P2) | `tests/builder_layout.test.ts` | banner/content rects, fit, overflow honesty, capacity |
| Selection (P4) | `tests/builder_select.test.ts` | seeded determinism, threshold, locks, shortfall |
| Serializer (P5) | `tests/builder_serialize.test.ts` | artboard px, nested per-icon `<svg>`, one stroke declaration, real `<text>`, byte-identical output, passes `validateSvg` |
| Metadata (P6) | `tests/builder_metarequest.test.ts`, `tests/builder_meta.test.ts` | text-only body (no `inlineData`), source equals the exported SVG, cap → announced digest; upload's prompt/parser/validator reused unchanged |

## Conventions

* Builder DOM tests mount `BuilderPanel` directly; shell behaviour is proven in the
  Workbench suite so the tab-bar contract has one owner.
* Pure `lib/builder/*` modules are tested without a DOM; any module that needs a parsed
  document takes an `Element` and is fed one by the test.
* A phase adds its rows here **in the same change** that adds its files (RULE 17).

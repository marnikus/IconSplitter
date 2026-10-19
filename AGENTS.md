# AGENTS.md — Icon Splitter agent entry

Browser-only React 19 / Vite 7 / TypeScript app. Start here, then open **only** the
pages for your task in [`docs/current/README.md`](docs/current/README.md). Current
contracts have one owner per topic; `docs/archive/` records history, not current
instructions. The app builds into one self-contained `dist/index.html`.

## Non-negotiable boundaries

- Node `22.12.0` (`.nvmrc`), npm 10; install with `npm run setup` (`npm ci`).
  Never run plain `npm install` over foreign-platform `node_modules/`.
- Never commit `node_modules/`, `dist/` or `coverage/`. A tracked local
  `dist/index.html` may be modified by a build: do not stage it.
- Secrets live in the browser store (`src/state/safestorage.ts`). Never create
  or touch `.env*`, `*.key` or `secrets.json`; secret-hygiene tests inspect even
  untracked text files. Do not put keys, prompts or image bytes in logs/journals.
- Local image processing and exports stay in-browser. Only an explicit,
  previewed, user-confirmed provider request sends its disclosed inputs
  (RULE 20). Do not make live provider calls while developing or testing.
- TDD for behaviour changes: witness a failing focused test, implement, then
  run it green. Real `src/lib/` logic is tested, not mocked (RULE 8).
- RULE 16 gates new production functions/components at 30 lines, 4 params,
  CC 10 and nesting 4; new files at 300 lines, hooks/component at 15. Read
  [`rules/QUALITY.md`](docs/current/rules/QUALITY.md) before changing code.
- Report progress and failures honestly; Stop blocks unsent work. One global
  undo timeline; validate persisted data on read. Full rule index:
  [`AGENT_RULES.md`](docs/current/AGENT_RULES.md).

## Open only what the task needs

| Task | Current owner |
|---|---|
| One of the six tabs | [`docs/current/README.md`](docs/current/README.md) → that tab's behaviour + invariant IDs + selectors |
| AI-source image-edit composites | [`sor/svg-image-edits.md`](docs/current/sor/svg-image-edits.md), [`invariants/svg.md`](docs/current/sor/invariants/svg.md), [`selectors/svg-image-edits.md`](docs/current/selectors/svg-image-edits.md) |
| Persistence, pair history or root paths | [`sor/STORAGE.md`](docs/current/sor/STORAGE.md) + the owning tab/invariants |
| Commands, build or gates | [`CODE_VERIFICATION.md`](docs/current/CODE_VERIFICATION.md) |
| Design handoff | [`design/README.md`](design/README.md), then the matching `SPEC.md` |

`src/lib/` owns pixel math, filesystem/pair logic and other pure algorithms.
Tabs live in `src/App.tsx`, `src/{batch,selection,selectionv2,svg,upload}/`;
shared state, UI and logs live in `src/{state,ui,log}/`. Tests are in `tests/`.
The six modes and precise source/test owners are linked from the current-doc router.

## Finish a change

Run focused tests, `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
`npm run verify:fast` before commit and `npm run verify` before push. On Windows,
if the native runner fails before its lanes start, run the equivalent lanes
separately and report that failure; never claim the aggregate gate passed.
Update the owning current pages, selector handles and doc route in the same
change (RULE 17). Append one measured dated entry to
`docs/current/QUALITY_RECHECK.md` **without reading that ledger**. Commit only
coherent scoped changes with `Verified:` and the required attribution; push the
current branch when the task is finished. Never silently discard others' work.

**Do not load as ordinary context:** `docs/current/QUALITY_RECHECK.md`,
`docs/archive/**` (open one named historical document only when required),
`design/**/*.html` or `dist/`. Avoid reading whole current directories; follow
one task route. Shallow clone? See `CODE_VERIFICATION.md` for the explicit-base
quality command.

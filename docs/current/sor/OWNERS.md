# Code owner map and layer direction

Open the one area page for your change, then the source file it names. Layer direction is below.

**Detail pages:** [Owners — sheets and batch](owners/sheets-batch.md) · [Owners — selection and pair files](owners/selection.md) · [Owners — Generate SVG and AI-source edits](owners/svg.md) · [Owners — SVG to upload](owners/upload.md) · [Owners — shared paths, prompts, keys and scans](owners/shared.md).

Direction: UI → batch/selection → lib, never upwards (RULE 1, RULE 3).

**SVG builder** — `src/builder/*` (feature: panel, source bar, scan, store, export,
metadata) over `src/lib/builder/*` (pure: config, layout, select, place, serialize,
metarequest). It may import `lib/*`, `ui/*`, `state/*`, `log/*`, `upload/keystore`,
`upload/configstore` and `selection/pairstore`; only `ui/Workbench` and `state/*`
import it.

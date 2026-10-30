# Upload output formats

Part of [export](upload-export.md) and [settings](upload-settings.md).

## Contract

Global and per-icon Export settings have independent **Export SVG** (`includeSvg`),
**Export JPEG** (`includeJpeg`) and existing **Also write EPS** (`includeEps`).
SVG/JPEG default ON, EPS stays OFF. All seven nonempty combinations work.
Unchecked outputs are not generated/written or included in the next committed
package; disabling JPEG also avoids raster rendering. EPS/JPEG may still need
shared in-memory prepared SVG, never an unwanted SVG output file.

Flags use normal live inheritance, row overrides, [Apply as local](upload-local-settings.md)
and Reset-to-inherited, with persistence/history through the same validated
settings paths. Missing/junk persisted SVG/JPEG defaults mean ON; overrides must
be booleans (false is a real pin). No storage/schema bump. Default fingerprint
`36232c04` stays unchanged, including legacy flags absent; disabling either adds
an explicit format token so rows become stale.

With all formats OFF, preflight fails clearly before filesystem work or rendering
and preserves the last package. Export selected excludes those rows from its paid
metadata confirmation; all-off selection shows a settings error without a paid
request. Mixed selection still exports eligible peers; no-output rows fail their
own preflight; the final toast counts failed rows instead of claiming they were
exported. An unavailable Inkscape warning names EPS-only failure, not partial
success. Explicit metadata generation remains available independently.

## Delivery and verification

The planner rebuilds/repairs only requested outputs. Missing or stripped disabled
files do not trigger reads/repairs; metadata edits re-embed requested carriers
without rendering again. Normal atomic writes, vector-only EPS audit and
SVG/JPEG/EPS metadata validation remain required for every requested output.
EPS-only conversion failure is FAILED with no empty committed package. Existing
partial-EPS behavior remains when SVG/JPEG can still be delivered.

After a successful re-export, disabled formats have null output entries in the
new `export.json`; Download all trusts those entries, not directory scans. Old
bytes are not deleted just by unchecking, and do not enter the new download.
Re-enabling rebuilds them. All-off/failed export keeps the previous record and
its previous Download all package: changing checkboxes is not a destructive
operation on already committed packages. Superseded-name housekeeping remains
unchanged.

## Selectors

- `upload-set-svg`: Export SVG checkbox, checked by default.
- `upload-set-jpeg`: Export JPEG checkbox, checked by default.
- `upload-set-eps`: existing Also write EPS checkbox, unchecked by default.
- `upload-set-marker-{svg,jpeg,eps}`: inherited/overridden, per-icon scope.
- `upload-set-formats-warning`: `role=alert`, only when all are off; names the
  required choice and that the previous package is preserved.
- Row `upload-settings-{id}` names `svg on/off · jpeg on/off · eps on/off`.

## Owners and tests

- `src/lib/upload/settings.ts`, `settingsfingerprint.ts`, `formats.ts` own
  validated fields, legacy defaults, enabled-format semantics and hash stability.
- `src/lib/upload/exportplan.ts` owns requested-only geometry, repairs, metadata
  deltas and record-only detachments; `src/upload/runexport.ts` owns preflight and
  requested disk probes; `exportmetadata.ts` owns requested-carrier readback.
- `src/upload/exportstages.ts` owns intermediate preparation, requested artifacts
  and EPS-only failure; `exportcommit.ts` owns enabled-only writes/record entries.
- `src/upload/UploadFormatSettings.tsx` owns choices and warning;
  `settingsfield.tsx` shares boolean control/marker/write plumbing.
  `metaselect.ts` filters paid export metadata by each row's effective formats;
  `exportactions.ts`/`uploadlog.ts` count genuine failures in the final summary.
- `tests/upload_output_formats.test.ts`: all seven real pipeline sets, actual
  files/carrier metadata, no JPEG renders while off, no-op, disable/re-enable,
  old bytes retained but excluded from downloads, no-format preflight, EPS-only
  failure and actual supplied `icon-handshake-heart_7_03_v2.svg` EPS-only.
- `tests/upload_output_formats_plan.test.ts`: every subset's record detach,
  missing-file repair and metadata-only stages; no all-off/disabled-SVG work.
- `tests/upload_output_formats_ui.test.tsx`: default checkboxes, warning,
  persistence, local batch flags/reset/undo/redo, paid-confirmation filtering,
  EPS-only helper failure and actual mixed-batch per-item isolation.
  `upload_uploadlog.test.ts` locks truthful failed-batch counts.
  Existing settings, stock-repair/export, inheritance/history and native gates
  remain unchanged except the exact default-object expectation adds both flags.

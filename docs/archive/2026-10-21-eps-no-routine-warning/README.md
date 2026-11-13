# Remove routine EPS shadow warnings — 2026-10-21

Problem: a supported vector shadow was still displayed as an amber alert on the
bulk toolbar, rows and settings dialog. It describes capability, not a detected
problem, so successful exports look broken.

Plan:
1. Change UI regressions to require no routine EPS notices with Shadow/EPS on,
   in both settings scopes, rows and the bulk toolbar; witness failures first.
2. Remove the three notices and their unused selection count/prop. Keep actual
   EPS stage errors, partial-status reporting and the vector-only audit intact.
3. Update selector/current docs; run focused UI/EPS tests and verification gates.

## Measured outcome

- Witnessed both notice regressions fail before implementation (2 failed / 77
  passed). Removed routine toolbar, row and dialog notices and their unused
  selection-count plumbing. No export/verifier/error-reporting logic changed.
- Focused UI/live-preview/export/doc regressions: 129/129 passed. Both settings
  scopes and row/bulk surfaces have no routine notice with Shadow and EPS on;
  export tests retain actual unsupported-paint and raster-rejection failures.
- `tsc` clean. `npm run verify`: ALL SIX LANES PASSED, including native performance,
  lint, changed-code quality, coverage tests and build.

# Compact export visual settings — 2026-10-26

## Request and diagnosis
Make the screenshot's export-settings area more compact without hiding controls. The generic settings grid spreads padding, stroke colour and endpoints across its first row, then starts a tall artboard block below. Custom width/height inputs inherit 100% widths inside a wrapping flex row, so each input and readout takes another line. Inline small-print also inherits unnecessarily tall surrounding line boxes.

## Plan before implementation
1. Add failing DOM/CSS layout-contract regressions over the real settings dialog in global and per-icon scopes, using the screenshot's 5500×3100 artboard and asymmetric padding. Verify every existing control/readout is still present outside disclosures, alongside responsive layout rules.
2. Group the existing visual controls into a full-width responsive primary grid: padding, artboard, and stacked paint/endpoints (plus the per-icon stroke width when applicable). Keep the rest of the popup untouched.
3. Put custom width/height with visible labels side by side, retain ratio/MP readouts, and keep Scale to / MP input / unit in one compact row. Inline the padding Default button with its heading and tighten only this area's spacing/hint line boxes.
4. Preserve all settings values, handlers, inherited/local markers, draft blur/Enter/Escape commits, Default/as-is, presets, decorations, formats and export algorithms. No new collapses, hidden fields, tabs, preferences or smaller fonts.
5. Run focused layout/interaction and existing regression suites; types, lint, changed-quality, fast/full gates. Update current behaviour/selectors, append measured quality evidence, commit/push the active session branch.

## Evidence
Completed: responsive padding / artboard / stacked-paints grid; inline padding Default; labelled W/H grid with ratio/MP; compact scale row with a 64px minimum target and wrapping inheritance labels; per-icon stroke input beside its Bar button. No control was moved into a disclosure or hidden. Existing field handlers, conditional modes, disabled states and exports are unchanged.

- TDD: corrected the test fixture to use the native value setter required by React's input tracking, then witnessed **4 failing layout tests / 1 passing existing-behaviour test** before implementation. After implementation all **5 passed**.
- Focused real-dialog/panel suites: **153 tests / 10 files passed**, including previews, padding, EPS scaling, disclosures, presets, local snapshots, formats and doc navigation.
- Types passed; lint **0 errors / 22 existing warnings**. Changed quality passed for all three edited TSX owners; new VisualSettings is a named layout responsibility, below all frozen limits.
- Fast gate: **ALL LANES PASSED**, **2947 tests / 279 files**, coverage **95.40 / 89.90 / 98.22 / 98.30%** (statements / branches / functions / lines), coverage lane 94.8s, build passed.
- Full gate: **ALL LANES PASSED**, same complete suite/coverage, plus **30 native tests / 5 files** (4.1s); coverage lane 96.0s, build passed.
- Current behaviour/layout owner, selector route and router updated. Initial router size failure (5033 bytes) fixed by linking layout through settings (4999 bytes), without changing any documentation budget.
- Logs: `/home/user/compact-export-settings/`. CSS/DOM layout-contract tests do not claim browser pixel measurements. No dependency, schema, provider, export algorithm, harness, isolation, budget or threshold changes.

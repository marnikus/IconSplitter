# Current documentation — choose one task route

Start at [the agent bootstrap](../../AGENTS.md). This page is a **router**, not
another copy of the contracts. Read one tab's behaviour and only the linked
invariants/handles you will change. For history, use the separate
[history index](../HISTORY_INDEX.md); do not load it for routine work.

| Task | Behaviour / flow | UI handles | Invariants |
|---|---|---|---|
| Single sheets | [sor/sheets.md](sor/sheets.md) | [selectors/sheets.md](selectors/sheets.md) | [core](sor/invariants/core.md) |
| Batch folders | [sor/batch.md](sor/batch.md) | [selectors/batch.md](selectors/batch.md) | [batch](sor/invariants/batch.md) |
| Selection / V2 | [sor/selection.md](sor/selection.md) | [selectors/selection.md](selectors/selection.md) | [selection & paths](sor/invariants/selection.md) |
| Generate SVG | [sor/svg-generation.md](sor/svg-generation.md) | [selectors/svg-generation.md](selectors/svg-generation.md) | [SVG & queue](sor/invariants/svg.md) |
| AI-source image edits | [sor/svg-image-edits.md](sor/svg-image-edits.md) | [selectors/svg-image-edits.md](selectors/svg-image-edits.md) | [I-71/I-72](sor/invariants/svg.md) |
| SVG to upload | [sor/upload.md](sor/upload.md) | [selectors/upload.md](selectors/upload.md) | [upload](sor/invariants/upload.md) |
| App shell / log / undo | [sor/shared.md](sor/shared.md) | [selectors/shared.md](selectors/shared.md) | [shared](sor/invariants/shared.md) |

Other on-demand references: [all invariant IDs](sor/invariants/README.md),
[storage keys](sor/STORAGE.md), [module owners](sor/OWNERS.md),
[test inventory](sor/TESTS.md), and [current deep dives](sor/topics/README.md).
The old [System of Record](SYSTEM_OF_RECORD.md) and
[UI Selector Reference](UI_SELECTORS.md) are small section/letter routers for
existing references; the pages above own the actual descriptions.

Rules: [RULE 1–24 index](AGENT_RULES.md) →
[behaviour](rules/BEHAVIOR.md), [quality/verification](rules/QUALITY.md), or
[documentation/privacy/delivery](rules/DOCS_AND_SAFETY.md). Commands and gate
semantics have one owner: [Code Verification](CODE_VERIFICATION.md).

`docs/current/QUALITY_RECHECK.md` is an **append-only evidence ledger**:
append one dated entry after measuring gates; never read it into an agent's
context. Archived designs and generated output are likewise not default context.

# Agent Rules — Icon Splitter

What an AI agent (or a human) **MUST** follow when adding or changing code here.
These 24 stable-numbered rules adapt the rules from
`Process-Images-in-Areana/docs/current/AGENT_RULES.md` to this React + Vite +
TypeScript browser app. Never renumber; append instead.

**In brief:** Keep pixel logic in `src/lib/`, report progress and failures honestly,
and test real behaviour. Use one undo timeline, validate persisted state, verify
exports, and deliver complete files. Work locally by default; send only disclosed
inputs to a named provider after preview and confirmation. Meet the RULE 16 gates,
aim for RULE 18 sizes, and keep the current docs true.

The original RULE headings below are compatibility links to the canonical text in
[behaviour](rules/BEHAVIOR.md), [quality and verification](rules/QUALITY.md), and
[documentation, privacy and delivery](rules/DOCS_AND_SAFETY.md). Only those
modules define the rules. RULE 12 retains its old link label; undo/redo **is** now
implemented (see its linked text).

| Original RULE heading → canonical text | Area |
|---|---|
| [RULE 1 — All pixel math goes through `src/lib/`](rules/BEHAVIOR.md#rule-1) | Behaviour |
| [RULE 2 — Report every step through the toast/status surface](rules/BEHAVIOR.md#rule-2) | Behaviour |
| [RULE 3 — Detection and rendering are pure functions of explicit inputs](rules/BEHAVIOR.md#rule-3) | Behaviour |
| [RULE 4 — Distinguish "empty" from "broken"](rules/BEHAVIOR.md#rule-4) | Behaviour |
| [RULE 5 — Batch export reports progress incrementally](rules/BEHAVIOR.md#rule-5) | Behaviour |
| [RULE 6 — Excluded / removed items must not persist into output](rules/DOCS_AND_SAFETY.md#rule-6) | Delivery |
| [RULE 7 — Interruption must be honoured by every long-running loop](rules/BEHAVIOR.md#rule-7) | Behaviour |
| [RULE 8 — Tests execute the real thing](rules/QUALITY.md#rule-8) | Verification |
| [RULE 9 — A disabled option must not stall the pipeline](rules/BEHAVIOR.md#rule-9) | Behaviour |
| [RULE 10 — One control per decision](rules/BEHAVIOR.md#rule-10) | Behaviour |
| [RULE 11 — Excluding an icon must not destroy detection work](rules/BEHAVIOR.md#rule-11) | Behaviour |
| [RULE 12 — If undo is ever added: one global timeline](rules/BEHAVIOR.md#rule-12) | Behaviour (legacy heading) |
| [RULE 13 — Never persist state you cannot read back](rules/BEHAVIOR.md#rule-13) | Behaviour |
| [RULE 14 — The export is not the sheet](rules/DOCS_AND_SAFETY.md#rule-14) | Delivery |
| [RULE 15 — Nothing is exported without the verification gate](rules/DOCS_AND_SAFETY.md#rule-15) | Delivery |
| [RULE 16 — Code-quality gates on every production change](rules/QUALITY.md#rule-16) | Quality |
| [RULE 17 — One current doc, dated archive](rules/DOCS_AND_SAFETY.md#rule-17) | Documentation |
| [RULE 18 — Ideal sizes: write for the reader's context budget](rules/QUALITY.md#rule-18) | Quality |
| [RULE 19 — Fix complexity before size (remediation order)](rules/QUALITY.md#rule-19) | Quality |
| [RULE 20 — Privacy & compliance: local by default; provider sends only by informed consent](rules/DOCS_AND_SAFETY.md#rule-20) | Privacy |
| [RULE 21 — Selector priority: semantic > structural > class fragment](rules/QUALITY.md#rule-21) | Quality |
| [RULE 22 — Export output must be traceable to its source](rules/DOCS_AND_SAFETY.md#rule-22) | Delivery |
| [RULE 23 — Delivery is atomic; never a partial file](rules/DOCS_AND_SAFETY.md#rule-23) | Delivery |
| [RULE 24 — LIVE SYNC: the UI mirrors the stored value at the moment of change](rules/BEHAVIOR.md#rule-24) | Behaviour |

Related current references: [System of Record](SYSTEM_OF_RECORD.md),
[Code Verification](CODE_VERIFICATION.md), [UI Selectors](UI_SELECTORS.md),
and the [current documentation router](README.md). The dated
[quality re-check ledger](QUALITY_RECHECK.md) is append-only; the
[documentation map](../README.md) distinguishes current material from history.

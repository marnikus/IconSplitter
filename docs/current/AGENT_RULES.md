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

| Original RULE heading → canonical text | Kind | Adapted from |
|---|---|---|
| [RULE 1 — All pixel math goes through `src/lib/`](rules/BEHAVIOR.md#rule-1) | behaviour | PIA RULE 1 — shared visual runner |
| [RULE 2 — Report every step through the toast/status surface](rules/BEHAVIOR.md#rule-2) | behaviour | PIA RULE 2 — engine.report() |
| [RULE 3 — Detection and rendering are pure functions of explicit inputs](rules/BEHAVIOR.md#rule-3) | behaviour | PIA RULE 3 — plain settings |
| [RULE 4 — Distinguish "empty" from "broken"](rules/BEHAVIOR.md#rule-4) | behaviour | PIA RULE 4 |
| [RULE 5 — Batch export reports progress incrementally](rules/BEHAVIOR.md#rule-5) | behaviour | PIA RULE 5 |
| [RULE 6 — Excluded / removed items must not persist into output](rules/DOCS_AND_SAFETY.md#rule-6) | data | PIA RULE 6 — filtered entities |
| [RULE 7 — Interruption must be honoured by every long-running loop](rules/BEHAVIOR.md#rule-7) | behaviour | PIA RULE 7 — stop gates |
| [RULE 8 — Tests execute the real thing](rules/QUALITY.md#rule-8) | testing | PIA RULE 8 |
| [RULE 9 — A disabled option must not stall the pipeline](rules/BEHAVIOR.md#rule-9) | behaviour | PIA RULE 9 |
| [RULE 10 — One control per decision](rules/BEHAVIOR.md#rule-10) | behaviour | PIA RULE 10 |
| [RULE 11 — Excluding an icon must not destroy detection work](rules/BEHAVIOR.md#rule-11) | behaviour | PIA RULE 11 |
| [RULE 12 — If undo is ever added: one global timeline](rules/BEHAVIOR.md#rule-12) | data | PIA RULE 12; legacy heading |
| [RULE 13 — Never persist state you cannot read back](rules/BEHAVIOR.md#rule-13) | data | PIA RULE 13 |
| [RULE 14 — The export is not the sheet](rules/DOCS_AND_SAFETY.md#rule-14) | data | PIA RULE 14 |
| [RULE 15 — Nothing is exported without the verification gate](rules/DOCS_AND_SAFETY.md#rule-15) | data | PIA RULE 15 — two-step gate |
| [RULE 16 — Code-quality gates on every production change](rules/QUALITY_GATES.md#rule-16) | quality | PIA RULE 16 (TS tools) |
| [RULE 17 — One current doc, dated archive](rules/DOCS_AND_SAFETY.md#rule-17) | docs | PIA RULE 17 |
| [RULE 18 — Ideal sizes: write for the reader's context budget](rules/QUALITY.md#rule-18) | quality | PIA RULE 18 |
| [RULE 19 — Fix complexity before size (remediation order)](rules/QUALITY.md#rule-19) | quality | PIA RULE 19 |
| [RULE 20 — Privacy & compliance: local by default; provider sends only by informed consent](rules/DOCS_AND_SAFETY.md#rule-20) | compliance | PIA RULE 20 — ToS adapted |
| [RULE 21 — Selector priority: semantic > structural > class fragment](rules/QUALITY.md#rule-21) | quality | PIA RULE 21 |
| [RULE 22 — Export output must be traceable to its source](rules/DOCS_AND_SAFETY.md#rule-22) | data | PIA RULE 22 — correlation token |
| [RULE 23 — Delivery is atomic; never a partial file](rules/DOCS_AND_SAFETY.md#rule-23) | data | PIA RULE 23 — atomic save |
| [RULE 24 — LIVE SYNC: the UI mirrors the stored value at the moment of change](rules/BEHAVIOR.md#rule-24) | behaviour | PIA RULE 24 |

Related current references: the [root router](README.md) (task read packs) and
[Code Verification](CODE_VERIFICATION.md). The dated
[quality re-check ledger](QUALITY_RECHECK.md) is append-only; the
[documentation map](../README.md) distinguishes current material from history.

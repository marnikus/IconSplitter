# Quality and verification rules

Canonical rules for this topic. Return to the [RULE 1–25 index](../AGENT_RULES.md) for the other rules.

**Detail pages:** [RULE 16 gates](QUALITY_GATES.md).

<a id="rule-8"></a>

## RULE 8 — Tests execute the real thing

Tests run the real `detect` / `render` logic against small synthetic images (canvas/image stubs where the browser APIs are unavoidable) — not mocks of `analyze`/`detect` and not assertions on UI strings. If a test would pass with the feature deleted, it is not a test. Assertions must check observable behaviour: box count, box coords, output dimensions, blob type.

<a id="rule-18"></a>

## RULE 18 — Ideal sizes: write for the reader's context budget

> **Preferences, not fail lines.** Only RULE 16 thresholds fail a change.

| Element | Ideal size | Sweet spot |
|---|---|---:|
| Function / component body | **4–20 lines** | ~8–12 |
| Single file | **150–300 lines** | ~200 |
| Module (one directory) | **5–15 cohesive files** | 7–10 |
| Context file (`docs/current/*`) | **≤ 9 KB** (docs test enforces), 60–200 lines | ~5 KB |

* Under 4 lines is fine when the name earns its place (domain predicate, required hook); not fine when the body is one call re-hosted under a meaningless name (§16.2 gaming).
* Over 20 lines usually means a second responsibility hiding inside the first — get back down via RULE 19.
* One **primary responsibility** per file, and a header comment saying what the file owns (`detect.ts` owns mask + boxes; `render.ts` owns output pixels).
* Cohesion test for directories: files that never change in the same commit belong in different directories.
* Over ideal is allowed **with visible reason**:

```ts
// ideal-size: 78 lines reason=single scanline loop over one mask; splitting would break locality
```

<a id="rule-19"></a>

## RULE 19 — Fix complexity before size (remediation order)

> When code is over the line, fix in this order: **nesting → cyclomatic → cognitive → size.** Size is the symptom; the other three are the cause.

**Step 1 — nesting (>4 → flatten).** Guard clauses: `if (!ok) return;` early so the happy path never indents. Invert conditions. Extract the innermost deep block first.

**Step 2 — cyclomatic (>10 → simplify).** Lookup tables instead of `if/else` chains (tables are data, not branches); strategies for interchangeable behaviour. Never delete a real decision to reach the number.

**Step 3 — cognitive (>15 → clarify).** Name the compound: a called predicate (`isStableIconCount`) reads better than `a && !b && c || d` inline. Obvious beats clever.

**Step 4 — size, last; usually already fixed.** If not, extract **by concept** with a name that already exists in the domain — never `fooPart1`. Too many params get a parameter object.

Verify after every step: the existing suite must stay green, because steps 1–3 must be behaviour-preserving.

<a id="rule-21"></a>

## RULE 21 — Selector priority: semantic > structural > class fragment

Applies to tests, and to any DOM query the app itself makes:

1. **Semantic**: `getByRole`, `getByLabelText`, visible text, `aria-*`
2. **Structural**: parent/child relationships, `:has(...)`
3. **Class fragment** (last resort): Tailwind utility classes — only with verification and fallback

Never depend on generated ids or on long Tailwind class chains as the primary handle.

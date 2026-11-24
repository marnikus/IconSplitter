# Live Progress & User Response Rules — Icon Splitter

Parent index: [`docs/current/AGENT_RULES.md`](../AGENT_RULES.md). Extends
[RULE 2](../rules/BEHAVIOR.md#rule-2), [RULE 5](../rules/BEHAVIOR.md#rule-5),
and [RULE 7](../rules/BEHAVIOR.md#rule-7) into one global progress-and-response
contract across all tabs.

---

<a id="rule-27"></a>

### RULE 27 — Every multi-item operation shows a live `ProcessProgressBar` with a persistent result; every single-item action gives an explicit visible response

**What it says:**
1. **Multi-item / bulk operations (`ProcessProgressBar`)**: Any operation that
   processes multiple items (exporting, renaming for upload, metadata batches,
   downloads, stock uploads, batch splits, bulk removals, indexing, etc.)
   **MUST** drive a live `ProcessProgressBar` (`src/ui/ProcessProgressBar.tsx` +
   `src/lib/processprogress.ts` + `src/lib/processslot.ts`) portalled to the
   tab's top-of-shell mount (`#upload-progress-mount`,
   `#stock-upload-progress-mount`, `#builder-progress-mount`, etc.):
   - **Live incremental progress**: yield between items (`setTimeout(..., 0)` /
     `requestAnimationFrame`) so `done / total`, `remaining` ("left"), `%`, and
     the current item name render live during massive batches rather than
     jumping from `0%` to `100%` after blocking the thread.
   - **Live cancellation**: wire `onCancel` (`AbortController`) and check it
     before starting each item so unsent/unprocessed items stop cleanly.
   - **Persistent result summary**: when finished (`completed`, `failed`, or
     `cancelled`), keep the bar open until dismissed (`✕`) or replaced by the
     next run, displaying the exact outcome breakdown (how many changed/wrote,
     how many already matched / needed no change, how many skipped and why, and
     how many failed with reason) alongside `→ Review results`.
2. **Single-item operations (no silent no-ops)**: Clicking an explicit single-item
   action (such as `✓ Apply name`, `Enter`, `✦ From Title + Description`, or
   `↺ Reset to work name`) **MUST** always produce an immediate, unmistakable
   visible response (inline status next to the control + tab toast/status bar)
   — **including when the item already has that exact value/name** (e.g.
   `"Upload file name is already … (no changes needed)"` or
   `"Already using work name … (no changes needed)"`). Never silently swallow or
   permanently grey-out a confirmation button solely because the sanitized value
   already matches current state.

**Verification:** Automated UI tests click both bulk actions (asserting
`running` → `cancelled` / `completed`, live `done/total/remaining`, persistent
result breakdown, and `✕` dismiss) and single-item actions on an item that
already has the target value (asserting enabled controls and fresh inline +
toast feedback on repeated clicks).

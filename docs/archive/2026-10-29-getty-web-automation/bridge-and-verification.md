# Getty web upload: bridge and verification design

Date: 2026-10-29. Proposal only; see `docs/archive/2026-10-29-getty-web-automation/design.md` and `docs/archive/2026-10-29-getty-web-automation/research.md`.

## Local boundary and file handoff

Recommended deployment: app served from the local bridge's own origin, bound exclusively to loopback, not a cloud-hosted app calling the user's localhost (a remote preview's localhost is the user's machine, not the sandbox). Disable web automation in remote preview and offer manual export. If existing `file://`/cross-origin modes are supported later, they need a separate threat review: `Origin: null`, broad localhost CORS, or an unauthenticated health endpoint are not proof of trust.

Before enabling web routes, establish explicit local-user pairing through a native helper window or terminal: a cryptographically random, short-lived one-time code displayed locally, user enters it into the app, server rate-limits/consumes it, and issues a high-entropy session capability bound to the exact allowed app origin and helper instance. Require it on every job/read/cancel request; do not put it in URLs or logs. Validate Host, Origin, content type and fetch metadata as defense in depth; reject missing/untrusted browser origins and simple-form requests on mutation routes. Restrict control endpoints to same-origin app, rate-limit and reject cross-site preflights. Pairing mitigates web-origin attacks, not hostile software already running as the same OS user. Do not simply reuse existing unrestricted routes as authorization.

The app sends a sanitized manifest and streamed file bytes to a helper-owned private temporary directory, not arbitrary host paths. Bind uploaded bytes to a single confirmed job, random opaque file IDs and declared sizes/digests; impose count, per-file, total-byte and concurrency limits. Validate safe basename/extension, reject separators, traversal, symlinks and duplicate names; create files exclusively with restrictive permissions. Verify received size/digest against the manifest before use. No shell execution, archive extraction, arbitrary filesystem read, or caller-controlled destination. Use atomic finalization and delete incomplete spool on failure/cancel; show if cleanup fails. Hashes help detect changed/truncated bytes, not prove Getty received them. Potential disk exhaustion and same-user access remain risks; document and bound them.

## Proposed logical protocol and job state

These are design contracts, **not existing endpoints**. All operations authenticated by the local session capability; no credentials in payloads.

| Operation | Contract |
| --- | --- |
| Create job | Validated manifest, unique idempotency key, destination/type and local consent reference; return opaque job ID and limits. Repeated same key/manifest returns same job; different manifest conflicts. No external network activity yet. |
| Stage file | Stream one approved file by opaque ID; verify size/digest, commit atomically; repeat only for files not acknowledged. Return receipt; cap aggregate storage. |
| Start | Only after complete manifest and consent, starts one worker for job; repeat is idempotent. Return current state, not success. |
| Status | Poll bounded, sanitized job and per-file states, counters and approved Getty batch link, no raw DOM, file bytes, usernames or secrets. Monotonic revision allows reconnect. |
| Cancel | Stop issuing new actions immediately; abort current work when possible and close controlled browser. Return `cancelling` until stopped, plus any remote-unknown results. |
| Forget | Explicitly purge terminal job and spool; TTL cleans abandoned spools after recovery window. Failure to remove is visible. |

State progression: `created → staging → ready → awaiting_login → navigating → uploading → verifying → completed / partial / failed`. `awaiting_user` may occur at login or any uncertain page; resume only on user action and renewed verification. Cancel can occur from any nonterminal state. A bridge crash/restart turns in-flight remote operations into `unknown`, not failed/successful; no automatic replay of create-batch or upload. A `completed` job requires verified receipt for every expected pair; otherwise `partial` or `unknown`. Handle JPG and EPS separately and show pair status only when both are evidenced. Persist only minimal non-secret state needed for reconciliation, bound to job/batch and file IDs; a persistent job record does not authorize a new upload.

## Recovery, background and results

- UI may close **after** the helper acknowledges staging; the local process/browser must remain running and the machine awake/network connected. Reopen app and re-pair to view the job. Browser closure, OS sleep, crash, session expiry and helper exit can interrupt it; no always-on service is assumed.
- On timeout, navigation failure, auth error, rate limit or 429: pause with safe, sanitized reason. Backoff only for safe read-only polling. Never blind-retry mutations after a lost response; reconcile using a verified batch ID and per-file remote evidence. If evidence is ambiguous or impossible, ask the user to inspect ESP before explicitly retrying, warning about duplicates. Never delete remote assets or batches automatically.
- Stop guarantees no new files are initiated after cancellation is observed, not that Getty rolls back an in-flight transfer. Mark in-flight items `unknown` until reconciled. Local staging and transferred bytes are not proof of server receipt; receipt is not approval or publication.
- Introduce distinct stage / received / submitted / unknown status semantics. Integrate `src/stockupload/historystore.ts`, `journal.ts`, `runupload.ts` and badge logic only after designing backward-compatible migration for prior staged-as-uploaded records. Old ambiguous records remain labeled historical/unverified rather than rewritten as confirmed.

## Implementation gates and test plan

1. **Permission and discovery gate:** get Getty's confirmation, test account and sanitized real-page evidence for selectors, batch types, success markers, session handling and allowed upload flow. No guessed production selectors. Decide whether API is preferable. Confirm provenance/metadata and CSS/DOM variability, including localization.
2. **Security gate:** threat model and test local pairing, Host/Origin/CSRF/DNS-rebinding protection, spool isolation, limits/cleanup, navigation allowlist, TLS, logging redaction and profile lifecycle. Reconcile credentials with I-81 and RULE 20 before implementation. Explain browser dependency installation/version/patched updates and support for intended Windows environment.
3. **Offline-first tests:** fake local portal and helper exercising login-required, manual challenge, account mismatch, file selection, EPS/JPG pairing, duplicates, changed files, partial and aggregate receipts, DOM changes, 429, timeouts, disconnect, crash, cancellation, replay/reconciliation and no submission. Test real repository code, byte allowlisting, no secret or raw page data in logs, cleanup, pairing rejection and old-history migration. No live provider calls in CI.
4. **User-consented acceptance:** once allowed, run a tiny legitimate batch with the owner present, observe and record sanitized evidence for correct account, type, filenames, per-file Getty confirmation, manual challenge, no final submit, cancellation/restart and headless vs visible behavior. Unknown means not passed. Verify manual fallback separately.
5. Implement in small tested slices; update current owner, invariants, selectors, docs router and tests only when behavior actually ships. Manual staged workflow remains available throughout.

# Proposed lifecycle and pairing protocol

Date: 2026-10-27. [Research recommendation and sources](README.md).
**Design only; not an implemented or benchmarked protocol.**

## 1. Separate four lifetimes

| Component | Proposed lifetime |
|---|---|
| Web UI | As long as user wants; stays open after tasks. |
| Installed browser extension | Installed persistently; event-driven worker may sleep when idle. |
| Native companion executable | Starts for an explicit batch/setup/test operation; exits after cleanup. |
| Remembered pairing/account references | Persist locally until revoked/forgotten; not a live process. |

Do not confuse “paired” or “installed” with “process currently running.” An idle UI
should say **Ready — companion starts when needed**, not misleadingly “Connected.”
A lightweight extension handshake must not start the host on every render/timer.
Native installation is verified during explicit setup or actual operation; a past
successful probe is not proof that the executable still exists now.

Chrome documents native-messaging process launch via `connectNative`; native-messaging
ports keep extension workers alive during the operation. MDN describes host exit or
port disconnection and browser cleanup after disconnection.
[1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
[2](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
[2](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative)

## 2. One-time setup

Proposed wizard:

1. User installs/enables the minimal extension. For consumer release, distribute
   through the appropriate browser store; developer-mode loading is a development
   workflow, not a polished consumer-install promise.
2. User runs a signed/trusted native installer appropriate to their OS. It installs
   the host executable and registers its manifest for the selected browser(s), with
   fixed extension IDs. Do not add a login item, scheduled task, Windows service,
   tray daemon or background updater merely to make launch work.
3. The extension's own setup screen runs a short explicit host probe. Host returns
   protocol/capability/version information; incompatible versions fail with setup
   guidance, not an upload attempt. Probe exits immediately afterward.
4. User authorizes the exact application origin (hosted edition) or the known
   packaged UI. Do not authorize broad preview-host wildcards, every file URL,
   arbitrary web origins or another extension's arbitrary requests.
5. User enters the stock account in an extension-owned or native-owned account
   editor. Proposed secret owner is the OS credential store, scoped to app/account;
   browser presets hold opaque account references and aliases, not passwords.
6. Confirm device-only persistence and allow explicit Forget/Revoke. Connection
   test, if requested, is its own consented short-lived job and sends no media.

Native app installation/registration is not done by the browser's native-messaging
API; Chrome/Edge require a separately installed native host and allowed extension
manifest. Browser store IDs and permissions must be handled in distribution.
[1](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
[1](https://developer.chrome.com/docs/extensions/how-to/distribute)

The username is also private: keep it with the password. Use a non-secret alias
for the stock checkbox. Do not redisplay saved passwords into web-page fields,
return them over extension IPC, include them in URLs, store them in `storage.sync`,
write them into project/export JSON or place them in CLI arguments/logs. Native
credential-store candidates are documented by keyring-rs; actual OS prompt/locked
store behavior must be tested. An unavailable store offers a labeled session-only
mode or fails safely; it never silently falls back to plaintext disk storage.
[1](https://github.com/open-source-cooperative/keyring-rs)

A malicious same-user native process is not defeated merely by a secret token or
an extension ID. State the threat model honestly; use a trusted executable path,
OS permissions and signed updates. The extension itself must be reviewed as a
privileged local boundary.

## 3. Per-batch sequence

1. **Prepare locally:** scan exported JSON, validate selected artifacts and hashes,
   resolve stock-specific format constraints and filename collisions. No native
   process or stock connection is needed just to browse the list.
2. **Confirm:** show immutable exact stock/account aliases, remote names, variants,
   byte counts and exclusions. Bind approval to a manifest digest. For the hosted
   edition, use an extension-controlled approval surface rather than treating an
   arbitrary page message as proof of a user gesture. Verify its browser UX during
   the spike; do not promise an unsupported automatic popup behavior.
3. **Start:** extension makes exactly one native connection for this batch. Chrome
   launches the host; the caller argument identifies the extension, not the original
   web-page origin. The extension verifies the web sender and forwards its validated
   identity. The host trusts only its permitted extension protocol, not a caller-
   supplied identity from a raw webpage.
4. **Handshake:** negotiate bounded protocol version/capabilities, fresh job nonce,
   manifest digest, valid account references and expected file/byte totals. Reject
   replay, expiry, mismatched origin/job/account or unsupported settings before auth.
5. **Transfer:** send only verified authorized file snapshots in sequenced chunks;
   companion rechecks chunk sequence, lengths and digest against the manifest.
   Use backpressure, independent FTPS timeouts and strict TLS validation. Never
   issue a generic “read this OS path” or shell command requested by a webpage.
6. **Settle:** record success/failure/uncertain state for every file × destination.
   All queued tasks settle before the batch finishes; no helper restart per file.
7. **Shutdown:** native host closes FTPS/data sessions, releases streams and secrets,
   writes a minimal non-secret recovery receipt when required, sends terminal result;
   extension durably saves/acknowledges the summary, then sends final close. Host
   exits and extension disconnects/releases its native port. Bound the handshake so
   a missing acknowledgment cannot leave an idle native process alive forever.
8. **Idle:** UI retains the result; no native service/listener remains. The next
   confirmed batch starts a fresh host and fresh job nonce using remembered grants.

This uses `connectNative`, not `sendNativeMessage` per chunk: browsers launch a new
host for each one-shot message, whereas a port supports a conversation with progress.
[1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

Proposed protocol vocabulary, not final code: hello/capabilities, authorize-job,
file-start/chunk/ack/file-end, progress, cancel, terminal/terminal-ack, close.
Forbid generic execute/download-URL/read-path operations. The host may connect only
to the stock preset's permitted destination. Neither origin allowlisting nor a
nonce alone proves file provenance or protects against a compromised authorized
app; the exact extension-owned job confirmation and restricted host API matter.

## 4. Failure and closure policy

| Event | Proposed behavior |
|---|---|
| All batch tasks finish, including partial success | Persist accurate summary, bounded graceful cleanup, host exits. |
| User cancels | Stop queued tasks; abort active data transfer, report possible remote residue; settle then exit. |
| One file fails | Isolate task; continue other valid tasks; exit after batch settles. |
| Destination authentication fails | Stop that target queue, no password retry storm; other approved targets may continue. |
| User switches app tabs / minimizes browser | Do not cancel solely for invisibility; worker owns the run. |
| User closes/navigates/reloads the owning web-app tab | Default: cancel unsent/active work and clean up. Do not rely on `beforeunload`; observe channel/tab loss from extension side. No silent restart/resend on reopening. |
| Browser shuts down or extension is disabled | Host detects stdin EOF/pipe loss and cancels/closes/exits; browser connection lifecycle supplies an additional cleanup boundary. |
| Native host crashes or disappears | Persist interrupted/uncertain results; do not auto-reconnect and replay a job. |
| Server wrote file but final acknowledgment was lost | Mark uncertain; reconcile before explicit retry. |
| Startup/permission/version error | Show actionable setup state; no stock login/file send; close any partial host. |
| Cleanup hangs | Graceful deadline, then release/disconnect native port; verify browser process cleanup on supported OS/browser. No unrelated PID termination. |

MDN documents that disconnecting gives a native application a short opportunity
to exit and then kills it if necessary; exact browser/OS behavior must be verified,
not generalized into a measured universal timeout.
[2](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative)

Implementation safeguards:

- No detached child daemon. If a transport subprocess is ever used, manage its
  lifetime too; killing only a launcher is not completion.
- Independently monitor IPC EOF while a network transfer is in progress. A blocked
  FTPS read must not prevent processing cancellation/connection loss.
- Use network/progress/handshake deadlines, not a fragile heartbeat from a hidden
  webpage. Throttled page timers must not abort a healthy background transfer.
- Do not copy Chrome documentation's reconnect-on-disconnect example verbatim:
  automatically reviving the native host contradicts this product's shutdown and
  no-automatic-resend policy.
- Browser suspension, machine sleep and network loss can interrupt a run. Never
  label a locally completed send as stock import/review acceptance.
- A proposed normal cleanup target such as five seconds is a design budget to
  test, not an API guarantee. Never force-kill an otherwise healthy long upload
  just because an arbitrary whole-batch time budget expired.

## 5. Hosted versus offline application

### Hosted edition

Exact externally connectable origins + runtime sender checks. Stable HTTPS origin
is preferable to changing dev/preview hosts. The browser-to-native channel is
local stdio, so no loopback HTTP port, CORS allowlist, localhost TLS certificate or
LAN permission is required for IPC. Existing remote providers remain separate,
user-confirmed features. There is no new cloud image/credential relay.

Chrome describes externally connectable sites; content scripts themselves cannot
call native messaging directly and must route through the extension worker.
[10](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
[1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### Offline edition

Repository's current self-contained file is not a trustworthy HTTPS origin.
Recommended optional build: same app as a packaged extension page, compiled under
MV3 CSP with external bundled scripts. Avoid granting broad `file:///*` messaging
or scripting privileges merely to recognize a copied HTML file. Retain the current
standalone HTML as a supported non-native edition unless explicitly changed.

Prototype directory picking, permitted file handles, metadata stores, downloads,
existing provider calls/CSP and settings migration on this new origin before
promising full parity. No automatic migration of passwords through an exported
settings file; do not attempt a wholesale untrusted localStorage import.

Chrome's extension-page CSP disallows inline JavaScript under its normal policy.
The current single-file build therefore needs an explicit additional build target,
not a hidden alteration of the existing standalone artifact.
[1](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

Chrome/Edge are the initial practical scope because current folder workflows already
target them. Firefox native messaging exists, but its website bridge, folder API
and extension packaging require separate work; native messaging support is not
proof that the complete application becomes cross-browser.
[1](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)

## 6. How a no-extension fallback would differ

If installing an extension is unacceptable, investigate a registered custom URI
that starts a temporary loopback helper after a click. It must still prove its
identity and bind an authenticated rendezvous to the actual app/session. A nonce
in a URI is not proof that the native launcher came from the genuine application;
a malicious website can choose a nonce and invoke the same scheme.

Requirements include browser launch prompt handling, native identity verification,
origin-bound authentication, one-use capabilities, local HTTP/TLS/LAN-policy
compatibility, anti-replay, Host/DNS-rebinding defenses and bounded auto-exit when
no authorized job arrives. Do not put passwords or file contents in the URI or
fetch jobs/credentials from arbitrary callback URLs. Do not change enterprise
browser policy or install trusted-root certificates merely to suppress prompts.

Microsoft explicitly warns that protocol activation has no reliable caller
identity; Edge documents its external-protocol prompt controls and limitations.
[1](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation)
[1](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/autolaunchprotocolsfromorigins)

It can be made workable, but it is not the elegant default for guaranteed quiet
launch + secure pairing + guaranteed idle shutdown. If the original standalone
HTML and zero extensions are both non-negotiable, revisit this tradeoff explicitly
rather than claiming the native-messaging recommendation already solves it.

## 7. Next authorized prototype and acceptance gates

Research did not install or execute any companion. Before full implementation:

1. Confirm deployment choice (hosted or extension-packaged offline UI), supported
   OS/browser and extension-install consent. Native packaging is new optional work,
   not authorization to revive the canceled Windows application.
2. Build the smallest signed/development synthetic echo host + minimal extension.
   Prove per-job launch, response, graceful exit and disabled/missing-host UX.
3. Test idle/open page -> **zero native companion processes**; start -> one host
   for one batch; terminal/cancel -> zero host/child processes. Verify via OS process
   inspection, not only a port-disconnected UI flag.
4. Test worker suspension with developer tools closed; long jobs, tab/app switches,
   navigation/close, browser shutdown, crashes, lost result ACK, sleep/network loss
   and duplicate clicks. No reconnect storm, orphan or silent resend.
5. Prove exact-origin/extension identity checks, owned confirmation, revoke, replay
   rejection, malformed/oversized frames and secret redaction.
6. Benchmark chunked IPC for realistic 1/10/50/100 MB synthetic files, memory peak,
   UI responsiveness and end-to-end throughput. Report numbers; no presumed winner.
7. Test real FTPS with a disposable local TLS server and synthetic credentials:
   mandatory AUTH TLS/protected data, certificates, passive-host restrictions,
   cancellation and uncertain outcomes. No live stock credentials in CI/chat.
8. Evaluate patched library, standalone packaging, OS keychain/locked-store UX,
   installer signing/uninstall, browser-store IDs and compatible update migration.
9. Only then implement the existing exported-only Upload plan and unchanged full
   quality/privacy/coverage gates. Stock ingestion remains separate manual acceptance.

## Research-only verification

The two-document research pack's local links and referenced existing plan paths
can be checked without running application code. No native prototype, browser test,
performance experiment, dependency install or stock upload is claimed. Do not infer
that the auto-lifecycle feature exists today from these design sequences.

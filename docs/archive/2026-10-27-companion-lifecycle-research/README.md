# On-demand companion: research and recommendation

Date: 2026-10-27. **Research/design only; no application or companion code.**
User goal: the web app starts its companion automatically when an authorized task
starts, pairs safely, and shuts it down after the task/batch finishes. No manual
terminal, permanent background service, startup-at-login or tray daemon.

Related original scope:
`docs/archive/2026-10-27-stock-upload-tab-plan/README.md`.
This is a new research record, not an edit to that earlier archived plan.

[Lifecycle, pairing, deployment and proof checklist](lifecycle.md).

## 1. Recommendation

**Use a minimal Chrome/Edge Manifest V3 extension and a registered native-messaging
host. Keep the native host alive only for one confirmed batch.**

This changes the earlier manual/local-launcher recommendation because the user
now explicitly wants task-bound process lifetime. Native messaging already gives
browsers the launch/communication mechanism: `runtime.connectNative()` starts the
registered executable and opens a persistent stdin/stdout channel. The host can
exit itself; disconnecting closes its native connection. It is not necessary to
invent an HTTP daemon just to bootstrap another HTTP daemon.
[1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
[2](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative)

Proposed normal use after one-time installation/pairing:

    Confirm Upload
        -> extension validates the app and confirmed job
        -> browser launches the installed companion
        -> companion authenticates to the stock and executes the batch
        -> final receipts are saved and acknowledged
        -> FTPS sessions close; companion exits; extension releases the port
        -> web app remains open and displays the result

“Automatic” means after the user's confirmed task, not automatic uploading on
page load/export/scan. Connection-test or credential-edit operations can also use
a short-lived host, but only when explicitly requested. Viewing the tab or checking
extension availability must not keep the companion running.

The extension remains **installed**, not an always-running native process. Chrome's
extension service worker is event-driven and may become dormant; a native-messaging
connection provides a strong keepalive during a job. We should not add reconnect
loops that restart an idle companion after successful shutdown.
[2](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

## 2. Why this wins for this requirement

Comparative judgment, not measured startup/performance results:

| Approach | Task-triggered start | End-of-batch shutdown | Tradeoff / recommendation |
|---|---|---|---|
| Extension + native messaging | Browser launches registered host | Graceful close + port disconnect | **Best fit** for hosted/browser UI and no idle daemon; requires extension + native installation. |
| Custom `iconsplitter:` launch link + temporary loopback service | OS handler can start installed app | Helper must implement its own lifecycle | Viable no-extension fallback, but prompts and a separate secure rendezvous remain. |
| Local launcher serving the web app | User starts launcher to open UI | Server normally needed for reload/UI availability | Good simple local deployment, not strictly “native process exists only while uploading.” |
| Startup-at-login/tray/OS service | Already running, not really on demand | Usually stays alive | Reject as default: contradicts requested idle lifecycle. |
| Full desktop wrapper | Native runtime owns the UI | App/window lifetime | Consider only if a desktop product is desired; larger product change than a companion. |
| PWA/service worker alone | Does not provide native host launch/FTPS mechanism | Not applicable | Not a substitute for installing native integration. |

A custom protocol is activation, **not authentication**. Microsoft's documentation
states that any app/site can invoke the scheme and the handler has no reliable
caller identity. Edge external-protocol prompt suppression depends on user choices
or managed policy. Therefore “one protocol link, silently paired forever” is not a
safe, portable promise.
[1](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation)
[1](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/autolaunchprotocolsfromorigins)

A PWA protocol handler opens the registered web app; it does not install an FTPS
native runtime. Programmatic/non-user-initiated activations also have limitations.
[1](https://developer.chrome.com/docs/web-platform/best-practices/url-protocol-handler)

## 3. How pairing should work

Use three layers, with no port-number entry, QR scan or copied shared password in
the normal native-messaging path:

1. **Browser -> native host:** installer registers the executable and host manifest;
   the manifest allows only our fixed published extension ID(s). The host checks
   the browser-provided caller extension identity. Chrome and Edge store IDs may
   differ and both must be registered explicitly, not with wildcards.
   [1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
   [1](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
2. **Web app -> extension:** for an HTTPS-hosted app, declare only its exact trusted
   deployment origin(s) as externally connectable, then check the actual browser
   sender URL/origin/top-level context at runtime. Never trust an `origin` string
   in the page's payload. Do not allow every website or every Arena preview host.
   Chrome supports website-to-extension messages through `externally_connectable`.
   [10](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
3. **User -> account/job permission:** proposed first-use extension-owned setup
   confirms which app is allowed to request uploads and which account alias is
   authorized. Each batch still has an exact destination/file/count confirmation.
   Bind each run to a fresh job ID/nonce, protocol version and manifest digest.
   Reject stale/replayed or modified requests. Remember grants locally; offer Revoke.

These are proposals built on the browser APIs, not existing app features. A
browser's extension ID identifies the permitted extension; a version string is
not proof of binary authenticity. Use trusted installers/signatures and update
verification in addition to runtime version negotiation.

## 4. Important discovery: this app also runs as a local HTML file

Repository evidence:

- `README.md`: `run_app.bat` opens `dist/index.html`; users can copy and open that
  self-contained file directly with no server.
- `docs/current/sor/OVERVIEW.md`: production is one offline self-contained HTML file.
- `src/ui/Workbench.tsx` and `src/lib/session.ts`: current browser UI/state shell.

Therefore “just allowlist the web app's HTTPS origin” is **not a complete integration
plan for the existing product**. Do not identify every `file://` page or an opaque
`null` origin as trusted, request access to all local HTML files, or rely on an
unauthenticated localhost endpoint to bypass this problem.

### If the user uses a stable HTTPS app

Keep that existing web app; the small extension is only its authenticated bridge.
There is no need for a helper-served UI or a localhost listener. The app's assets
and private files do not need to transit a cloud relay.

### If the user wants the existing offline experience

Preferred proposal: **an optional extension-packaged edition of the same React UI**,
opened as a normal browser tab from the extension icon. It talks internally to
its extension worker. The native companion still starts only for transfer jobs.
Keep the standalone HTML edition available for current non-transfer workflows.

This is another build target, **not a claim that the current HTML can be pasted
unchanged into an extension**. Extension pages restrict inline JavaScript and
remotely hosted executable code; produce packaged external JS/assets under MV3
CSP and test the app accordingly.
[1](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
[2](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)

Changing to an extension origin also requires explicit migration of local settings
and a new directory-permission grant where needed. Do not promise that existing
file-origin IndexedDB handles/secrets automatically move. Do not export passwords
as part of migration. The native credential store can remain the single account
owner independent of web UI origin.

**Decision needed before implementation:** stable HTTPS web app + bridge extension,
or optional packaged offline UI + native host. Do not silently change deployment
mode or build the previous canceled Windows application.

## 5. Data path: do not send a complete EPS in one message

Native messaging is framed JSON, not a raw file stream. Chrome currently documents
1 MB host-to-extension messages and 64 MiB extension-to-host messages; Microsoft's
Edge page and MDN document different upper bounds in the other direction. Build
well below the smallest applicable limit and test supported browser versions,
rather than relying on a maximum quoted by one vendor.
[1](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
[1](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
[1](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)

Proposed first transport: sequenced **128 KiB raw chunks**, base64 encoded in JSON,
with strict decoded-size limits, acknowledgments, small bounded send windows and
backpressure. A 128 KiB chunk becomes about 171 KiB before JSON overhead. Native
progress/control messages remain small. Do not buffer all selected files in memory
or expose arbitrary disk paths to the helper.

Start with this no-listener architecture. It avoids CORS, local TLS certificate,
DNS-rebinding and browser local-network permission machinery entirely for this
app-to-host data path. However, base64 copies/CPU and throughput are real tradeoffs;
**no performance claim until benchmarked** with actual file sizes and concurrent
stock tasks. Chunk data only for the confirmed JSON-declared export artifacts.

If measurement later justifies a temporary binary loopback channel, use native
messaging to bootstrap and authenticate it with per-run capability/endpoint data;
it is an optimization requiring a separate security/browser-permission review,
not a prerequisite or default always-on server.

## 6. What the companion should be built with

Keep TypeScript for the app and extension. Native host choice is separate from the
launch architecture; do not choose Electron merely to perform FTPS.

Two credible candidates, **neither installed or benchmarked here**:

- **TypeScript/Node + basic-ftp, packaged as a standalone executable:** smallest
  conceptual change for this repository. The library documents explicit FTPS,
  passive mode and stream uploads. Node supports single-executable packaging;
  the user's PC need not have a separately installed Node runtime when properly
  packaged. Packaging/version/signature/keychain dependencies still need testing.
  [1](https://github.com/patrickjuchli/basic-ftp)
  [1](https://nodejs.org/api/single-executable-applications.html)
- **Rust native host + FTPS and native credential-store libraries:** reasonable
  long-term native boundary, but adds a Rust toolchain and separate maintenance.
  SuppaFTP provides FTPS/TLS and streaming options; keyring-rs exposes platform
  credential stores. These are candidates, not a security audit or approval of
  every backend/default.
  [1](https://github.com/veeso/suppaftp)
  [1](https://github.com/open-source-cooperative/keyring-rs)

Recommendation: approve **native messaging architecture first**. Compare a tiny
synthetic host prototype in the most maintainable stack before choosing the shipping
binary. For this TypeScript repo, start evaluation with Node/basic-ftp; choose Rust
if measured packaging/credential-store/security requirements justify the new stack.
Do not infer current patch levels from old examples: the basic-ftp repository has
recent security fixes. Pin an audited patched release at implementation, keep TLS
validation on, disallow separate passive transfer hosts and do not enable verbose
FTP credential/payload logging.
[1](https://github.com/patrickjuchli/basic-ftp)

No new package, language runtime, extension, native host or installer was added.
No claim is made about binary size, startup latency, antivirus trust, store approval
or FTPS compatibility without a prototype.

## 7. What can and cannot be automatic

**After one-time user setup:** launch on confirmed task, local IPC pairing/handshake,
FTPS work, cleanup and helper exit can all be automatic under the proposed design.

**Not silently automatic:** installing native software, installing/enabling a browser
extension, initial account/pairing consent, OS keychain permissions, granting folder
access, bypassing managed browser policies, or suppressing certificate errors.
Chrome's normal consumer distribution uses the Web Store and requires user approval;
external installation is not permission to silently enable the extension.
[1](https://developer.chrome.com/docs/extensions/how-to/distribute)
[1](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions)

The helper closes; the web app does **not** close. Already completed transfers are
not undone. A crash or interrupted remote acknowledgment must be reported honestly,
not automatically retried by restarting the helper. See lifecycle.md for the proposed
normal, cancellation, tab-close and crash behavior.

## Research status

Official browser/OS documentation and library repositories were read; repository
launch mode was inspected. No prototype, native transport benchmark, OS installation,
credential entry, stock login or live upload was performed. Lifecycle guarantees
are documented API behavior plus proposed safeguards, **not measured acceptance**.
The previous test-runner native-module blocker was not repaired for this research.

# Upload extension/companion — setup and acceptance

[Behaviour/security/storage](stock-upload.md) · [selectors](../selectors/stock-upload.md)

## Developer build

Use the repository's Node22.12.0/npm10. `npm run setup` installs the locked npm
workspace (including native build/test dependencies). No native service starts.

```
npm run build
npm run build:extension
npm run companion:package
```

`dist/index.html` is still the standalone offline app. Build the extension AFTER
it: the normal build empties dist. `dist/extension` contains external scripts/CSS
for MV3 CSP, not the single-file inline script. Do not serve it as a native bridge.
The per-platform host package is `companion/build/<platform>-<arch>/`; keep its
executable **and node_modules together** in a stable local directory. It embeds
the Node runtime; using it does not require a separate Node installation.
Development build scripts do require Node/npm. The prototype embeds the repo-pinned
Node22.12.0; that build pin is **not** production security clearance. Review/update
the embedded runtime through the repository process before production release. Cross-platform builds/signing
must happen on each target OS; Windows packaging requires SDK signtool and macOS
uses codesign. This is not the abandoned Windows desktop application.

## One-time local installation

1. For developer acceptance, load `dist/extension` as an unpacked extension in
   Chrome/Edge's extension manager. Normal-user distribution still needs store
   review, a stable published ID and normal installation/consent. Never silently
   enable developer mode or alter enterprise browser policy.
2. Note its EXACT extension ID. Move the host package to its final stable path.
   Run `iconsplitter-stock --install EXACT_ID chrome` (or `edge`); on Windows the
   executable has `.exe`. Registration is per-user, no administrator/service.
   Install once for each browser/ID you actually approve. Neither installer nor
   extension can silently install/approve the other.
3. Open IconSplitter from its extension action. Its browser storage is separate
   from file:// and the normal website: reselect folders/re-enter provider keys.
   If a configured HTTPS AI provider requires cross-origin extension access, the
   shell's permission button requests only that entered HTTPS origin (optional
   permission; no wildcard grant). Stock transfer uses no browser host permission.
4. In Upload, choose exported files and expand Local Shutterstock account. Enter
   credentials **on your own PC**, Save locally, approve keychain access if asked.
   No username/password belongs in chat or a repo. A missing keychain fails safely.
5. Review selected files/formats/EPS compatibility, press Upload and confirm.
   Reconcile uncertain results in the portal before another attempt. Transfer
   does not submit files for stock review.

For removal, Forget account in the UI first if desired, then run
`iconsplitter-stock --uninstall chrome|edge`. Registration is removed; receipts
and credentials are not silently deleted. Remove extension/package only after
checking active tasks/history. A changed executable location requires reinstall.

## Measured here vs manual release gates

Automated local tests exercise a disposable explicit-FTPS server with fake
credentials and in-memory test certificates. No stock server/login/upload is
used. Native IPC/staging process tests use a synthetic sink, not an FTPS speed
simulation. The Linux-x64 Node22.12 SEA executable was packaged and smoke-tested:
per-user registration in a temporary HOME, exact origin rejection, handshake,
cancel/exit and uninstall; no password or real browser installation was used.

Remaining **manual acceptance**, not claimed complete:

- Chrome and Edge on target Windows/macOS/Linux: installation, extension worker
  with devtools CLOSED, long jobs, page reload/close, disabled/missing host,
  browser kill, hung keychain, permission prompts and OS process cleanup.
- Windows/macOS executable builds, trusted code signing/notarization, binary
  provenance/vulnerability/license review and store submission/approval.
- OS keychain save/read/forget and lock behaviour on the user's actual account.
- Extension file-picker/storage/provider parity; no real browser binary was
  available in this sandbox. Existing happy-dom tests are not a substitute.
- Authorized real Shutterstock transfer and metadata import/ingestion/category
  submission/review; FTPS readback alone is not acceptance.
- End-to-end browser IPC/network throughput and realistic large-list UX. The
  native synthetic measurements do not prove a browser/network speed target.

No automatic retry, URI activation, local HTTP listener or always-on daemon is
implemented as a workaround for those gates.

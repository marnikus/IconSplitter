# Upload — exported packages and on-demand companion

This is the **sixth** tab, independent of [SVG to upload](upload.md). See
[selectors](../selectors/stock-upload.md). The existing single-file offline app
remains the default. Only the optional extension edition can start native FTPS.

## Inventory and UI

Pick a folder (or an `export` folder itself). Discovery reads only `export.json`
inside physical `export` directories, then intersects declared outputs with
existing, byte-count/SHA-256-verified files in that same directory. A missing
format is reported while other verified formats remain listed. Orphans, source
SVGs, uncommitted/corrupt records, traversal paths and changed bytes are excluded.
Historical `sha256:` hashes are supported; relocated packages rebase only the
final basename onto the containing export directory. Approved-source discovery
and export rendering are never used by this tab.

Rows retain name/path, Location (honest folder-path copy), exported thumbnails,
metadata, badges and active/checked/anchor semantics. Selection uses Batch
helpers, modifier range/toggle, Q/E, visible-scope bulk actions and global undo.
Selection/presets/zoom are browser-local; the folder handle uses existing IDB and
permission restoration/path binding. Existing badge catalog/assignments are
shared by committed pair ID; selection IDs are physical package-relative paths.
The selection, zoom, badge apply, upload, destination and format toolbar is pinned.
Badge CRUD, colour, multi-apply and filtering reuse existing implementations.

Metadata edits validate/auto-accept and re-embed already-exported JPEG/SVG/EPS,
read back, then update hashes and write export.json LAST. No source/rerender.
A caught write failure attempts byte-exact rollback. A crash/failed rollback may
leave a package rejected by its old hashes: rescan/re-export before upload;
this is not a filesystem-wide atomic transaction. PNG/ZIP metadata rewriting
is deliberately unsupported. Readback does not prove stock ingestion.

## Destinations and confirmation

Destination preferences are an allowlisted array, not arbitrary host URLs.
Shutterstock is the only installed descriptor/transport; its dropdown, selection
checkbox and locally named format presets are stock-specific. Further stocks
need a reviewed descriptor, transport/account slot and tests, not a user URL.
Shutterstock permits this implementation's JPEG and EPS subset; PNG/SVG/ZIP
controls stay visible but cannot send unsupported formats. JPEG ≥4MP/≤50MB;
EPS ≤100MB and artwork bounds 4–25MP at72DPI; AI8/10 compatibility requires the
user's explicit review of the current selected EPS hashes. Changing that set
invalidates the review. Duplicate remote names block a batch.

Upload requires an extension-owned confirmation naming files, byte total and
`ftps.shutterstock.com:21`. Files are revalidated, snapshotted, then transported
only for that immutable manifest. Transfer is **not** category/metadata portal
entry, submission, review or acceptance. CSV imports remain portal-only.
Stop blocks unsent work; failed/uncertain files stop the batch. No silent retry.

## Native lifecycle and security

MV3 background accepts only its exact internal index.html URL, its own extension
ID, and a source tab. No content scripts, web origin bridge or external messages.
The native manifest and host independently enforce installed exact extension IDs.
One source channel owns a host; native account locking also spans browsers.
`connectNative` launches for a confirmed task; no host is opened merely by
visiting a tab. Hello/version/fresh nonce, increasing request IDs and manifest
digest bind the session. File chunks are128KiB raw, sequenced/ACKed with one
outstanding request; framed messages ≤512KiB, batches ≤1000 files/2GB. Private
staging verifies byte count, digest and bounded media headers before any FTPS.
Explicit TLS validates certificates on control/data channels; never downgrade.

Credentials go only to the OS keyring (Windows credentials/macOS keychain/Linux
Secret Service, pinned without kernel-memory/plaintext fallback). The app can
save/forget but cannot read back stored passwords. Keychain unavailable/locked
fails closed. Account actions also launch a short-lived host. No credentials in
URLs, command arguments, browser preferences, exports, receipts or logs.

An uncertain intent is flushed to the native receipt journal BEFORE remote write;
a terminal receipt is flushed before acknowledgment. Transferred/uncertain hashes
block replay until explicit user reconciliation. Existing remote names are
refused. FTP LIST→STOR is not atomic against another computer/client: do not run
competing external uploads; no remote no-clobber guarantee is claimed.
Completion/ACK, cancellation, source-channel EOF or deadline closes FTPS and the
host. No reconnect/resend. Source page reload/close disconnects its channel.
Switching an in-app tab preserves an active confirmed run; no resident daemon.
A hard OS/browser kill can leave uncertain remote files, private temp staging and
an `active.lock`. Check portal/receipts, ensure **no host is running**, then remove
only that stale lock; no automatic lock stealing. Clear reconciled history only
after verifying every uncertain/transferred file. Never erase it to force a retry.

## Source/storage owners and verification

- Inventory/policy: `src/lib/stockupload/`; UI/state: `src/stockupload/`.
- Extension: `extension/{manifest.json,background.ts}`, `vite.extension.config.ts`.
- Native: `companion/src/{main,runtime,session,job,staging,mediacheck,ftp,vault,storage,lock,install}.ts`.
- Browser keys: `iconSplitter.stockUpload.{selection,preferences}.v1`; IDB handles
  slot `stockUpload.root.v1`; existing badge/path stores retain sole ownership.
- Native directory: `%LOCALAPPDATA%/iconsplitter-stock` (Windows), else
  `$XDG_DATA_HOME/iconsplitter-stock` or `~/.local/share/iconsplitter-stock`:
  installation IDs/manifest, receipt journal and owned account lock. Passwords
  live separately in OS keyring service `IconSplitter Stock Upload`.
- Tests: `tests/stockupload*.test.{ts,tsx}` cover strict inventory, real metadata
  carriers/rollback, UI, worker origin/ownership, real local TLS FTP, native
  framing/process exit/replay and1/10/50/100MB chunk/staging probes.
- Build/setup and honest platform gates: [companion guide](stock-upload-setup.md).

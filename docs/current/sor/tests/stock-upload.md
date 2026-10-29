# Tests — Stock Upload and Getty ESP handoff

| Test | Contract |
|---|---|
| `tests/stockupload_ui.test.tsx` | Exported-only UI, local-only FTP credentials, transfer confirmation, Adobe SFTP behavior, and Getty's separate official ESP link/manual-upload disclosure; Getty must not appear as a transfer target. |
| `tests/stockupload_presets.test.ts` | Built-in Shutterstock/Adobe defaults, custom protocol handling, and validate-on-read preset normalization. |
| `tests/stockupload_runner.test.ts` | Confirmed FTPS/SFTP upload plans, per-file outcomes, progress and crash recovery. |
| `tests/stockupload_discovery.test.ts` | Committed `export/` + `export.json` artifact scope and honest missing/corrupt file handling. |
| `tests/stockupload_metaembed.test.ts` | In-place local metadata embedding and export manifest updates. |
| `tests/bridge_ftps.test.ts`, `tests/bridge_sftp.test.ts` | Local synthetic protocol servers only; no live stock provider calls. |

See [the behavior contract](../stock-upload.md), [selector handles](../../selectors/stock-upload.md), and [Getty research](../../../archive/2026-10-29-getty-images-contributor-upload/README.md). Local tests do not prove Getty ESP upload acceptance.

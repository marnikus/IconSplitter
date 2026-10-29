# Owners — Stock Upload and Getty ESP handoff

Choose the owning layer for the Upload (`stockUpload`) tab.

| Layer | Files | Owns |
|---|---|---|
| FTP/SFTP domain | `src/lib/stockupload/{types,presets,plan,bridgeclient,credvault,discovery,zippack}.ts` | validated stock preset model and defaults, transfer planning/warnings, protocol client contracts, local credential isolation, exported-only discovery and deterministic ZIP packages |
| FTP/SFTP orchestration | `src/stockupload/{ftpactions,runupload,presetstore,keystore,historystore,journal,scan,metaembed,panelops}.ts` | preset and credential actions, transfer runner, persisted statuses/recovery, filesystem scan, local metadata embed and panel operations |
| Stock Upload UI | `src/stockupload/{StockUploadPanel,StockUploadControls,StockUploadBulkBar,StockFtpPanel,StockUploadList,StockUploadRow,StockUploadPreview,StockUploadDialogs,StockUploadMetaFields}.tsx` | exported rows, filters, selection, FTP/SFTP settings, confirmation, upload progress and local metadata UI |
| Getty manual portal handoff | `src/stockupload/GettyContributorPortal.tsx` | official ESP sign-in link and Getty-specific manual-upload/content-preparation notice; no Getty credentials, direct transfer, or upload status |
| Local bridge | `tools/bridge/{ftps,sftp}/`, `tools/bridge/server.mjs` | local network FTPS/SFTP only; never browser-side provider access |

Behavior contract: [stock-upload](../stock-upload.md). UI handles:
[stock-upload selectors](../../selectors/stock-upload.md). Invariants: I-80/I-81.

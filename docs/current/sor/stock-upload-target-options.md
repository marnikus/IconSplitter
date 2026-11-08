# Stock Upload — per-target options

The **Stocks preset** control in the pinned bulk bar opens a row for each configured stock, including custom stocks. It saves JPEG/PNG, SVG, EPS, ZIP, and Title + description choices independently per target. Until a target is edited, the current global format and metadata choices are its defaults. The confirmation and transfer plan use each target’s saved choices. ZIPs are packed deterministically in memory with `JSZip`, without `export.json`; source files are not rewritten.

The global **Random batches** option and **Limit** count apply across targets. A positive Limit chooses that many icons randomly from the checked selection, keeps the rest selected, and implies random 100-icon batches. See the [Stock Upload selectors](../selectors/stock-upload.md) for control handles.

See [Stock Upload](stock-upload.md) for the full transfer and credential contract.

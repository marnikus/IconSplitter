# Folder scan performance (2026-11-06)

[Shared shell](shared.md) · [Storage](STORAGE.md)

Every tab's scan (Batch, Selection V2, Generate SVG, SVG to upload, Upload)
walked the folder **one file at a time** (a `getFile()` per file just for size
and mtime), then read every pair file one at a time — each lookup re-resolved
from the root — and a return to Generate SVG repeated it all. On a
latency-bound drive (a cloud-synced folder) that is thousands of sequential
round trips.

## What changed

| Change | Where | Effect |
|---|---|---|
| Parallel walk: listings and file opens through one bounded pool (`WALK_CONCURRENCY` 24); the slot is held only while listing, never while children are walked; same nodes, same order | `src/lib/fs.ts` `readDirTree`, `src/lib/limiter.ts` | every tab's scan |
| Parallel pair-file reads (16 at once) through one shared loader | `src/selection/pairstore.ts` `loadPairFiles` — used by `loadPairDecisions` (Selection V2, Generate SVG) and `src/upload/discovery.ts` | ~1000 pair files no longer one by one |
| Session cache of parsed pair files per (folder handle, path, size, mtime); a hit is a deep copy; `saveMetaAt` forgets that file in every folder's cache (even an identical size/mtime write) | `src/selection/paircache.ts` | an unchanged rescan reads and parses no pair file |

Single-file reads (`loadMetaAt`: undo, reload after a run, Remove's "before")
stay uncached — they must see the disk as it is.

## Measured

`tests/scan_perf.test.ts`, a "slow drive" fake (every listing / lookup / open
waits; the old cost is calibrated on the machine as operations × measured
latency). 120 pairs, Windows, 2026-11-06: old one-at-a-time ≈ **16.8 s**; new
first scan **0.93 s** (−94 %); unchanged rescan **0.44 s** (−97 %, 612 instead
of 1092 operations, 0 pair-file reads); peak 24 in flight. The tests assert
≥ 80 % for the walk and for a first scan and a rescan, identical walk results,
cache hits / misses on size or mtime change / app writes, and per-folder
separation.

## SVG to upload row assembly (2026-11-06)

After discovery, SVG to upload read every pair's `export.json` and every
source SVG and SHA-256-hashed it, **one row at a time**, each lookup resolved
from the root — and again after every restart. Now (`src/upload/rowreads.ts`,
`assembleRows` in `rowmodel.ts`): rows assemble 16 at a time with at most 24
file operations in flight; a reader resolves each folder once per assembly; and
source hashes are stored per (SVG path, size:mtime fingerprint) in
`iconSplitter.upload.sourceHash.v1` (validated on read, newest 10 000 kept), so
an unchanged SVG is never read or hashed again — a changed fingerprint is.
Measured (`tests/upload_assemble_perf.test.ts`, 60 pairs, slow-drive fake):
old **7.58 s** → nothing remembered **0.23 s** (−97 %) → after a restart
**0.22 s** with no SVG read. Row previews stay behind Lazy previews.

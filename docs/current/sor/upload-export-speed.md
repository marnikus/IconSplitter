# Export speed (2026-11-08)

Part of [export](upload-export.md). Outputs are unchanged: the SVG, EPS and
`export.json` are byte-identical to before and the JPEG is byte-identical to the
main-thread canvas encode (`tests/upload_jpegworker.test.ts`, checked in a real
browser for white/blue backgrounds and quality 1 / 0.92).

## What was slow

For one icon at 5500×3000 (16.5 MP), JPEG quality 1, built-in EPS, SVGO: about
60 % of the time was `canvas.toBlob`, which encodes on ONE thread (eight at once
take eight times as long; rasterizing the SVG costs a few ms). The rest was
geometry, file-system round trips (every read walked its folder path again, six
levels deep) and a file commit that read and hashed each output several times.
The batch ran one icon at a time, so the CPU, the encoder and the disk each idled
while another worked.

## What changed

* **JPEG worker pool** (`lib/upload/jpegworker.ts`, used by `raster.ts`): the main
  thread paints the SVG with the same `drawImage` on the background fill and
  MOVES the bitmap (`transferToImageBitmap`); a pool of 2–6 workers (half the
  cores) encodes with `OffscreenCanvas.convertToBlob`. Blob-URL worker, so
  `dist/index.html` stays one file. Injected transports (tests), browsers
  without workers, and a failing worker all use the original canvas path. Idle
  workers are released after 20 s. A returned JPEG is still decoded and size-checked.
* **Overlapping batch** (`exportactions.ts`, `exportLanes`): as many icons in
  flight as the pool has workers (bounded memory: ~130 MB per picture), never more
  than icons, and ONE lane when any row writes EPS through Inkscape. Cancel,
  per-item isolation, progress (counted per committed package) are unchanged.
* **Directory cache** (`withDirCache` in `lib/fs.ts`): one per batch; a folder is
  looked up once and shared by every lane; failures and files are never cached.
* **Commit** (`exportcommit.ts`): svg/jpg/eps commit side by side (`export.json`
  still LAST; a failure throws after every file ended); the saved file is
  compared byte-for-byte (word-wise `sameBytes`) instead of verified twice; each
  record hashes the bytes just proven saved instead of re-reading the file.
  The tmp → verify → overwrite → cleanup protocol is unchanged.
* **Geometry**: `tokenizePath` is remembered per path string (steps are shared,
  read-only); `cubicDistanceWithin` allocates nothing. Prepared SVGs are identical.

## Measured

Real `runExport`, headless Edge 157, 12-thread PC, folder five levels deep, one
real line icon, 60 icons per run. "ms per FS call" is a delay added to every
file-system call to model a slow or cloud-synced drive.

| drive | before | after | less time |
|---|---|---|---|
| fast local (no added delay) | ≈ 390 ms/icon | ≈ 135–150 | ≈ 63 % |
| + 3 ms per FS call | ≈ 850 | ≈ 160 | ≈ 81 % |
| + 8 ms per FS call | ≈ 1390 | ≈ 205 | ≈ 85 % |

With no file I/O at all the pipeline needs ≈ 86 ms/icon (the 16 MP encode on 6
workers is the floor), and a browser can write only ≈ 150–180 files/s, so a fast
drive cannot reach 80 %. Not measured: Chrome's real folder picker, antivirus,
Google Drive.

## Owners

`lib/upload/jpegworker.ts`, `raster.ts`, `lib/fs.ts` (`withDirCache`),
`upload/exportactions.ts`, `exportcommit.ts`, `lib/upload/geom/path.ts`,
`geom/expand/offsetcheck.ts`. Tests: `tests/upload_jpegworker.test.ts`,
`tests/upload_exportspeed.test.ts`.

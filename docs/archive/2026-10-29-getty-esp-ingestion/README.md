# Getty ESP automatic ingestion research and design (2026-10-29)

## Evidence

The user-provided [ESP Ruby client tutorial](https://github.com/mpimedia/esp_api_code_examples/blob/main/tutorial%20%281%29.pdf) and [example uploader](https://github.com/mpimedia/esp_api_code_examples/blob/main/lib/contribution_uploader.rb) describe the ESP Submission and Ingestion APIs, not a public FTP service. The tutorial requires an ESP account and API key and secret supplied by Getty's ESP API team. It is historical: its password-grant OAuth URLs and TLS verification bypass must not be assumed current. Use the existing current Getty OAuth authorization flow and strict TLS, and confirm credentials and access with Getty.

For automatic ingestion the tutorial specifies: create a submission batch; POST `/esp/ingestion/v1/contributions` with batch id, bucket and file descriptors; for each 10 MiB file part GET `.../{id}/authorize_chunk` with the part's SHA-256 hex digest, part number and `raster_file`; PUT the bytes to the returned HTTPS URL with its returned headers; collect response ETags; PUT `.../{id}` with the ordered ETags and raster flag for each file. An illustration pairs the JPEG in `raster_file_name` and optional EPS in `file_name` on the **same** contribution. It is not two independent contributions. The sample's `Token token=...` header applies to ESP; never forward Getty API credentials to the S3 upload URL.

A fully uploaded contribution is not necessarily submitted for review. The tutorial says metadata extraction is asynchronous, and separately documents metadata updates and `.../submit`; controlled vocabulary, account-specific mandatory fields, and validation errors must be respected. Never claim publication or submission merely because bytes were uploaded.

## Implementation plan and constraints

1. Implement and test the tutorial ingestion multipart protocol separately, with HTTPS certificate verification, SHA-256, returned ETags, paired file association, failure and cancellation propagation, and no logging of credentials or signed URLs. No live calls or real credentials in tests.
2. Integrated: the pair is a single browser-to-loopback request, preserving export.json discovery, avoiding extra filesystem staging, and recording the Getty badge only after all required ESP completion responses succeed. Incomplete or failed pairs must not be marked uploaded. Consider bridge request size, cancellation, session isolation, and partial remote artifacts.
3. Implemented: replace the fake direct-PUT flow, use an automatic API default, migrate old presets, and update UI, tests and docs. The correct iStock illustration submission-type enum and present-day API compatibility must be confirmed with Getty's current ESP Swagger / a provisioned sandbox before claiming a working live integration; do not guess or infer it from an unrelated Getty Creative Still type.
4. Still needed: verify the supported OAuth flow, illustration batch type and endpoint with the API team; sandbox only after the user explicitly authorizes a test. No production upload or publication without explicit confirmation.

The prior `esp-batch` feature only stages local files. It does not upload them to Getty and must not be described as automatic upload. The prior ESP direct-PUT implementation and its self-consistent fake server do not follow the tutorial's multipart ingestion protocol; earlier claims of a working live Getty integration were not supported by a live test.

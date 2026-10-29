# Getty ESP connect/upload failure — deep research, root causes, fix

Date: 2026-10-29. Status: **implemented + fake-server verified; NOT live-verified**
(no Getty credentials are available to the agent and AGENTS/RULE 20 forbid live
provider calls while developing). Current contract:
[`../../../current/sor/stock-upload.md`](../../../current/sor/stock-upload.md) §3–§4.

## 1. Symptom

`Test connection` / upload for the Getty Images preset (`esp-https`,
`api.gettyimages.com:443`) returned an error no matter which credentials were
entered. The user could not see the exact codes, so the fix also had to surface
full error codes to the helper console and to the UI message/log.

## 2. Evidence base (primary sources, not blog guesses)

1. Getty's own ESP API tutorial ("Ruby ESP Client Application Tutorial", PDF)
   and code examples (`mpimedia/esp_api_code_examples` on GitHub:
   `oauth_login.rb`, `lib/contribution_uploader.rb`, `lib/uploader.rb`,
   `create_submission_batch.rb`, …).
2. Getty ESP Go SDK (`dysolution/espsdk` + `dysolution/sleepwalker` +
   `dysolution/gettyup`, written against the production ESP API):
   `ProdAPI = https://api.gettyimages.com/esp`,
   `SandboxAPI = https://esp-sandbox.api.gettyimages.com/esp`,
   endpoints under `/submission/v1/submission_batches`, token form
   `grant_type=password` with all four credentials, headers
   `Authorization: Token token=<token>` + `Api-Key`.
3. Current Getty developer docs (`developer.gettyimages.com/docs/authorization/`):
   auth service moved to `authentication.gettyimages.com/oauth2/{auth,token}`;
   only Authorization-Code+PKCE and Client-Credentials grants are documented
   publicly today — the ESP password grant is an ESP-API-team arrangement, and
   DeepMeta (Getty's own contributor tool) now logs in via browser OAuth
   authorization, which proves third-party ESP upload exists only under a
   Getty-granted integration, never via contributor FTP.

## 3. Root causes in the old implementation (ranked)

1. **Wrong Authorization scheme (fatal).** Old client sent
   `Authorization: Bearer <token>`. ESP (a Rails API) requires
   `Authorization: Token token=<token>`. Reproduced in tests: a faithful fake
   answers `HTTP 401 Invalid authentication token` to the old client even with
   a valid token. Bearer is only for the v3 customer search/download API.
2. **Fabricated fallback login.** With the "optional" API Key/Secret empty,
   the old client sent `grant_type=client_credentials` with the ESP
   username/password as `client_id`/`client_secret` — guaranteed OAuth
   refusal. Real ESP login is the password grant and needs **all four**:
   ESP-issued API key + secret and ESP username + password. The tutorial is
   explicit that the key/secret are *"provided by the ESP API team"* (`ESP - Test`
   key in samples) — a self-service developer search key has no ESP submission
   entitlement (token may succeed, ESP then answers 401/403).
3. **Invented binary-upload flow.** Old client POSTed metadata to
   `…/submission_batches/{id}/contributions` and then PUT the file to a guessed
   `storage_url`/`…/upload` URL. The real flow is Ingestion v1 multipart:
   initiate → authorize each chunk by SHA-256 → PUT chunk to S3 `upload_url`
   with returned signed headers → collect `ETag` → complete with ETags.
   EPS and JPG are the `file` and `raster` slots of **one** illustration
   contribution, not two independent contributions.
4. **Token endpoint coupling.** Old client always used
   `{api host}/oauth2/token`. Sources disagree by era:
   `authentication.gettyimages.com/oauth2/token` (current docs),
   `api.gettyimages.com/oauth2/token` (tutorial + Go SDK),
   `api.gettyimages.com/auth/oauth2/token` (examples `oauth_login.rb`).
   Fix tries them in that order for `*.gettyimages.com` hosts, continuing only
   on 404/405/unreachable — a 400/401 refusal stops and is reported verbatim.
   The tutorial also notes the auth service is shared (not the `base_uri`
   host), which matters for the sandbox API host.
5. **Diagnostics were flattened away.** Only one of
   `error_description|message|error` survived; HTTP status context, the OAuth
   `error` code, ESP `errors{}` hashes, non-JSON bodies, `WWW-Authenticate`,
   and all response headers (hence any `ETag`) were dropped, and the helper
   console logged nothing. Users saw a generic failure with no actionable code.
6. Minor: no `?limit=` on the batch-list probe; `storage_url` PUT used the
   wrong TLS policy for foreign hosts; batch was auto-created per session but
   contributions were never completable, so nothing could ever land in ESP.

Why tests didn't catch it: `tests/helpers/fakeesp.mjs` mirrored the invented
protocol (Bearer + storage_url PUT), so the suite was green against a server
that does not exist. The fake was rewritten to enforce the real surface first
(TDD RED: 6/6 failing, incl. the 401 above), then the client was fixed (GREEN).

## 4. The real ESP upload protocol (as implemented)

Base: `https://api.gettyimages.com/esp` (sandbox:
`https://esp-sandbox.api.gettyimages.com/esp`). All ESP calls:
`Authorization: Token token=<access_token>`, `Api-Key: <ESP API key>`,
`Content-Type/Accept: application/json`.

1. `POST {auth}/oauth2/token` form: `grant_type=password`,
   `client_id=<ESP API key>`, `client_secret=<ESP API secret>`,
   `username=<ESP login>`, `password=<ESP password>` → `access_token`.
2. `POST /esp/submission/v1/submission_batches`
   `{submission_name, submission_type: "getty_creative_still", save_extracted_metadata: true}`
   → `{id}` (or reuse the batch id appended to the preset path).
   Connection test = `GET …/submission_batches?limit=5` (proves ESP
   entitlement, not just token issuance).
3. Per paired item, `POST /esp/ingestion/v1/contributions`
   `{submission_batch_id, upload_bucket: "oregon", file_name: "<stem>.eps",
   mime_type, raster_file_name: "<stem>.jpg", raster_mime_type}` →
   `{contribution_id}` (single-file items declare only their slot).
4. Per ≤10 MB chunk (≥5 MB except last): `GET
   /esp/ingestion/v1/contributions/{id}/authorize_chunk?id=…&encrypted_payload=<sha256-hex>&part_number=N&raster_file=<bool>`
   → `{upload_url, headers}`; `PUT upload_url` with exactly those headers →
   response `ETag` header.
5. `PUT /esp/ingestion/v1/contributions/{id}`
   `{id, etags:[{part_number:"1",etag},…], raster_file:<bool>}` per slot.
6. Contributions remain **drafts** in the batch (ESP extracts embedded
   IPTC/XMP asynchronously; stock metadata is embedded into the exported
   EPS/JPG by this app). Review & submit in ESP. The helper returns
   `espBatchId`/`espContributionId`; the run toast/log names the batch.

## 5. How to connect (user checklist)

1. Confirm you can sign in at `esp.gettyimages.com` with the contributor login.
2. Get ESP API access: a normal developer key from
   `developer.gettyimages.com` (search/download product) does **not** include
   ESP submission. Ask Getty Contributor Relations / your Getty contact (or
   contributor support via ESP) for *ESP API submission access for a desktop
   upload tool* — application registration, ESP-enabled API key/secret,
   whether the password grant is enabled for that key (or only
   authorization-code), sandbox credentials, permitted `submission_type`
   values for your account, and allowed `upload_bucket` regions.
3. Start `run_ftp_bridge.bat`, open the Upload tab → Getty Images preset,
   save ESP login + password + ESP API Key + ESP API Secret, click
   **Test connection**. Read the exact result in the banner, the helper cmd
   window (`[bridge] … FAILED stage=… http=… code=…`), the browser console,
   and the activity log; see §6 for what each code means.
4. Upload paired EPS+JPG; then open the named draft batch in ESP, check the
   extracted metadata/keywords, and submit for review there.
5. If Getty has not granted ESP API access, use the supported no-API route:
   **Download ESP CSV** + upload the files through the ESP website (or
   DeepMeta/qHero, which hold their own Getty integration). There is no
   contributor FTP for Getty/iStock (Getty FTP endpoints that exist belong to
   Media Manager DAM libraries and per-assignment editorial transmission).

## 6. Error-code table (stage → meaning → action)

| Stage | Typical HTTP | Server codes | Action |
|---|---|---|---|
| `helper-probe` | — / non-200 | helper down/outdated | Start/restart `run_ftp_bridge.bat` (it must be this build — `/health` must expose `esp.ready`). |
| `esp-credentials` | (no request sent) | lists missing fields | Save all four ESP credentials in the Getty credential card. |
| `oauth-token` | 400 | `unsupported_grant_type` | This API key may not use the password grant — ask Getty to enable it, or use the ESP CSV/DeepMeta route. |
| `oauth-token` | 400/401 | `invalid_client` | API Key/Secret wrong, not found, or not an ESP API key. |
| `oauth-token` | 400/401 | `invalid_grant` | ESP username/password rejected (use the ESP portal login, not a buyer login). |
| `oauth-token` | 404/405 (all endpoints) | — | Getty moved the auth service again; report the full console line. |
| `esp-batch-list` | 401 | `Invalid authentication token` (+ `WWW-Authenticate: Token …`) | Token/key pair not accepted by ESP — key lacks ESP association. |
| `esp-batch-list` / `esp-batch-create` | 403 | e.g. submission access not enabled | Token is valid but the key/account has no ESP submission entitlement — request it from Getty. |
| `esp-batch-create` | 422 | `errors: {submission_type: …}` | Account may not create `getty_creative_still` batches; ask Getty which type your (iStock) account needs or paste an existing batch id into the preset path. |
| `esp-ingest-initiate` | 422 | `errors: {file_name/upload_bucket: …}` | Read the field messages verbatim from the banner/log; bucket/type/file pairing issue. |
| `esp-chunk-authorize` | 401/403/422 | token/`encrypted_payload` messages | Session token expired mid-run (re-test) or chunk authorization contract drift — report the line. |
| `s3-chunk-put` | 403 | S3 XML `SignatureDoesNotMatch` etc. (body excerpt shown) | Signed headers/URL expired or clock skew; retry the run; report the excerpt if persistent. |
| `esp-ingest-complete` | 422 | `errors: {etags: …}` | Part set incomplete — retry; report the line if persistent. |
| `cert` (any) | — | TLS fingerprint/pin message + SHA-256 | Use **Trust & pin** only after verifying the fingerprint with Getty; production Get
...[truncated 1747 chars]
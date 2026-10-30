# Getty Images / iStock (`contributors.gettyimages.com` · `esp.gettyimages.com`) Research & Connection Architecture (2026-10-29)

## 1. Why `POST https://api.gettyimages.com/oauth2/token` Returned `HTTP 403: Forbidden`

Investigation of Getty Images' official API & OAuth2 documentation (`https://developers.gettyimages.com/api/`, `https://developer.gettyimages.com/docs/authorization/`, `https://developers.gettyimages.com/release-notes/`) and partner workflows (**DeepMeta 4** at `https://deepmeta.creativ.zone` and **qHero** at `https://qhero.com`) identified three distinct reasons `Test connection` returned `Getty ESP HTTP 403: Forbidden`:

1. **OAuth2 Authorization Server Host Migration (`authentication.gettyimages.com`, not `api.gettyimages.com`)**:
   - Getty migrated OAuth2 token and authorization endpoints off `api.gettyimages.com` onto **`https://authentication.gettyimages.com/oauth2/auth`** and **`https://authentication.gettyimages.com/oauth2/token`**.
   - `api.gettyimages.com` is an AWS API Gateway resource server requiring an `api-key` header and mapped `/v3/*` or `/esp/*` paths; hitting `/oauth2/token` on `api.gettyimages.com` (or omitting `User-Agent` / `api-key`) returns AWS API Gateway's `HTTP 403 {"message":"Forbidden"}`.
2. **Retirement of `grant_type=password` in Favor of OAuth 2.0 Authorization Code + PKCE (`S256`)**:
   - Getty's OAuth2 server supports **`authorization_code` (with RFC 7636 PKCE `S256`)**, **`refresh_token`**, and **`client_credentials`**.
   - Crucially, Getty's official Redirect URI policy explicitly allows **unregistered plain-HTTP loopback URIs** (`http://127.0.0.1:<port>/esp/oauth/callback` and `http://localhost:<port>/...`) without pre-registering the callback URL with Getty.
   - Confidential clients send `client_secret` during token exchange; public PKCE clients must omit `client_secret` (our bridge retries without `client_secret` automatically if a public client rejects it).
3. **API Tier Gate — Self-Service `/v3` Keys vs Partner `/esp/submission/v1` Keys**:
   - Standard self-service keys from `developer.gettyimages.com` receive **Customer Catalog API v3** permissions (`GET /v3/countries`, `/v3/search/images`), **not** `ESP Contributor Submission` permissions (`/esp/submission/v1/submission_batches`).
   - Calling `/esp/submission/v1/submission_batches` with a customer-only `/v3` key returns `HTTP 403 {"message":"Forbidden"}` until Getty Contributor Support / Partner Engineering grants **ESP Contributor Submission** access (the partner tier used by DeepMeta 4 and qHero).
   - Probing `GET /v3/countries` whenever `/esp/submission/v1/submission_batches` returns `403` cleanly distinguishes *"valid Getty API key & OAuth2 token, but missing ESP Submission partner tier"* from *"invalid/inactive API key"*.

---

## 2. How Contributors Actually Upload Vector Icons to Getty Images / iStock Today

Getty Images and iStock offer **no public contributor FTP/FTPS/SFTP server** for Creative / Illustration uploads (`feedsftp.gettyimages.com:21` is Editorial live news `<24h` only; `files.transfer.brandfolder.com:22` is Enterprise Media Manager DAM only; account-rep FTP is issued only by special arrangement).

Therefore, IconSplitter provides **three clean connection/upload modes** under the **Getty Images** preset:

1. **`esp-batch` — Getty ESP Batch Folder (`esp.gettyimages.com` / DeepMeta 4) *(Default — works for 100% of contributors with zero API keys)***:
   - In IconSplitter, exported icons live in separate per-icon `<pair>/export/` folders (`pack_a/icon1/export/icon1.{eps,jpg}`, `pack_a/icon2/export/icon2.{eps,jpg}`). Neither `esp.gettyimages.com` nor DeepMeta 4 can ingest nested per-icon subfolders directly.
   - Clicking **`Upload`** in `esp-batch` mode validates Getty's pairing/size/keyword rules, writes flat, non-overwriting (`RULE 23`) copies of every selected icon's `<stem>.eps` + RGB `<stem>.jpg` into `<root>/_getty_esp_batches/<batch>/`, generates **`getty_esp_metadata.csv`** (`file name,created date,title,description,country,brief code,keywords`) inside that exact same folder, and assigns the **`Getty Images`** badge in the unified general row-badge system.
   - Contributors drag all files from `<root>/_getty_esp_batches/<batch>/` straight into **DeepMeta 4** (`https://deepmeta.creativ.zone` — applies `.csv` + `.eps` + `.jpg` simultaneously in one drop) or **Getty ESP** (`https://esp.gettyimages.com` → `iStock Creative Illustration` batch + CSV import).
   - Because `_getty_esp_batches/` is not named `export` and has no `export.json`, `discoverExportedItems` (`I-80`) never re-discovers staged batch files as duplicate rows.
2. **`esp-https` — Getty ESP Partner API (`:443` OAuth2 PKCE)**:
   - For contributors/partners whose Getty API key has ESP Submission access enabled.
   - Uses `https://authentication.gettyimages.com/oauth2/auth` + `/oauth2/token` (PKCE `S256` via `http://127.0.0.1:47391/esp/oauth/callback`, `refresh_token`, or `client_credentials`), sends `User-Agent`, `Api-Key`, and Bearer token headers to `https://api.gettyimages.com/esp/submission/v1/submission_batches`, and runs `/v3/countries` diagnostics on `403`.
3. **`ftps-explicit` (`:21`) / `sftp` (`:22`)**:
   - Available via the Protocol dropdown for account-rep FTP, Editorial `feedsftp.gettyimages.com:21`, Media Manager `files.transfer.brandfolder.com:22`, or aggregator FTP (`ftp.microstock.plus:21`).

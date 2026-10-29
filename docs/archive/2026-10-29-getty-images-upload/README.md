# Getty Images / iStock (`contributors.gettyimages.com`) — Contributor Connection & Upload Research & Design

**Date:** 2026-10-29  
**Portal:** `https://contributors.gettyimages.com/home` → **Getty ESP:** `https://esp.gettyimages.com`  
**API Root:** `https://api.gettyimages.com` (`/oauth2/token` + `/esp/submission/v1/...`)

---

## 1. Research Findings: How Contributors Actually Connect & Upload to Getty Images / iStock

Unlike Shutterstock (`ftps.shutterstock.com:21`, Explicit FTPS) and Adobe Stock (`sftp.contributor.adobestock.com:22`, SFTP), **Getty Images and iStock (`istockphoto.com`, owned by Getty Images) do NOT provide a public contributor FTP/FTPS/SFTP server for Creative Stills or Vector Illustrations**:

1. **Unified Contributor Pipeline (`contributors.gettyimages.com/home` → `esp.gettyimages.com`)**:
   - Getty Images retired legacy iStock FTP in February 2017. One contributor account and one submission platform — **Getty ESP (Enterprise / Enhanced Submission Platform, `https://esp.gettyimages.com`)** — feeds both **iStock** and **Getty Images** (official Contributor Help Articles `9146`, `10847`, `7170`).
   - Mobile `Contributor by Getty Images` supports RF creative stills only; **all vector illustrations, batch stills, editorial non-live assets, and videos** are submitted through **ESP**.

2. **Three Real Getty Images Connection & Ingest Channels**:
   - **Channel 1 — Getty ESP HTTPS REST API (`esp-https`, `api.gettyimages.com:443`)** *(Primary programmatic channel)*:
     - **OAuth 2.0 Token Exchange**: `POST https://api.gettyimages.com/oauth2/token` (`Content-Type: application/x-www-form-urlencoded`) using either:
       - **Resource Owner Password Credentials (`grant_type=password`)** for ESP contributor accounts: `client_id=<Api-Key>&client_secret=<Api-Secret>&username=<ESP-Username>&password=<ESP-Password>`, or
       - **Client Credentials (`grant_type=client_credentials`)**: `client_id=<Api-Key>&client_secret=<Api-Secret>`.
       Returns `{ "access_token": "<token>", "token_type": "Bearer", "expires_in": 1800 }`.
     - **ESP Submission Endpoints** (`Api-Key: <Api-Key>`, `Authorization: Bearer <token>`, `Accept: application/json`):
       1. `GET /esp/submission/v1/submission_batches` — verifies account authorization and lists open batches.
       2. `POST /esp/submission/v1/submission_batches` — creates a submission batch (`submission_name`, `submission_type: "getty_creative_still"`, `save_extracted_metadata: true`).
       3. `POST /esp/submission/v1/submission_batches/{batch_id}/contributions` — registers each file (`file_name`, `mime_type`, `headline`, `caption`, `recorded_date`) and returns a presigned upload target (`storage_url` / `external_file_location`), followed by binary `PUT` upload of the asset bytes.
     - *Partner API Key Note*: Getty restricts ESP Submission API keys (`Api-Key` + `Api-Secret`) to approved Getty/iStock developer/partner keys (such as DeepMeta, qHero, or enterprise contributor integrations).
   - **Channel 2 — Getty ESP Web Portal / DeepMeta 4 + Official ESP CSV Metadata Import** *(Universal contributor workflow)*:
     - Contributors without an ESP API key upload paired `.eps` + `.jpg` files in `https://esp.gettyimages.com` or **DeepMeta** (`https://www.deepmeta.com`) / **qHero** (`https://qhero.com`) and attach an **ESP Metadata CSV** file:
       - Exact lowercase header columns: `file name,created date,title,description,country,brief code,keywords`
       - Keywords are comma-separated inside double quotes (max `50` controlled-vocabulary terms; ESP auto-adds read-only orientation/color terms).
       - Embedded JPEG IPTC/EXIF/XMP (`Headline`/`ObjectName`, `Caption`/`Description`, `Keywords`) is also extracted when `save_extracted_metadata` is enabled.
   - **Channel 3 — Specialized Getty FTP / SFTP Ingest Endpoints** *(Enterprise DAM & Live Editorial only)*:
     - **Getty Media Manager / Brandfolder Enterprise DAM**: `sftp://files.transfer.brandfolder.com:22` (**SFTP `:22` only**; plain FTP disabled; requires account-manager provisioned SFTP ingest credentials).
     - **Getty Editorial Live News & Sport Picture Desk**: `feedsftp.gettyimages.com:21` (test: `ftp.newsandsport.gettyimages.com:21`) strictly for live assignments within 4 hours of an event; non-live content goes through `esp.gettyimages.com`.

---

## 2. Official Getty Images / iStock File & Metadata Rules

Per Getty Images Contributor Requirements (`contributors.gettyimages.com` Articles `9146` & `10847`):

1. **Vector / Illustration (`EPS` + `JPG` Same-Basename Pair Mandatory)**:
   - **Vector file**: Adobe Illustrator **`EPS`** compatible with **Illustrator 10 / CS6**, RGB or CMYK vector paths, **all shapes closed**, stray points removed, custom brushes/effects expanded, all text converted to outlines, no embedded bitmaps/rasters.
   - **Mandatory Raster Preview**: Every `.eps` file **must** be uploaded alongside a matching RGB **`.jpg`** file with the **exact same basename** (`<stem>.eps` + `<stem>.jpg`). Minimum JPEG preview dimensions: **`1900 × 2800 px`** (~`5.32 MP`), **`4075 × 4075 px`** (~`16.6 MP`) recommended. Standalone `.eps` without `<stem>.jpg` (or paired with `.png`) is incomplete.
   - **Unsupported container/vector formats**: Standalone `.svg` and `.zip` archives are **not** accepted by Getty ESP.
2. **Still / Raster (`JPEG`)**:
   - RGB `JPG`, minimum **`3 MP`**, maximum **`256 MP`**, standard creative file ceiling **`50 MB`**, no upscaling.
3. **Metadata & Content Compliance**:
   - **Title (`headline`)** + **Description (`caption`)** + up to **`50` keywords** (`5–50` terms recommended; Getty ESP maps terms against its controlled vocabulary).
   - **Generative AI Policy**: Getty Images / iStock strictly prohibits creative assets or reference images generated with generative AI tools (Midjourney, DALL-E, Stable Diffusion, etc.).

---

## 3. IconSplitter Implementation Design

1. **Unified General Badge System (`src/lib/upload/rowbadge.ts`)**:
   - Register `{ id: "getty-images", name: "Getty Images", color: "#14c997" }` in `HARDCODED_STOCK_BADGES` alongside `Shutterstock` and `Adobe Stock` — one general badge system, automatically assigned to an item row as soon as any file is uploaded to Getty Images.
2. **Built-in Preset & Transport (`src/lib/stockupload/{types,presets}.ts`)**:
   - Add protocol `"esp-https"` (`port: 443`, TLS verified/pinned/self-signed) and template `"getty-images"`.
   - Seed `GETTY_IMAGES_PRESET` (`id: "getty-images"`, `name: "Getty Images"`, `protocol: "esp-https"`, `host: "api.gettyimages.com"`, `port: 443`, `remoteDir: "/esp/submission/v1/submission_batches"`), auto-appending it when migrating existing `localStorage` snapshots while allowing protocol switching (`esp-https`, `sftp`, `ftps-explicit`, `ftp`) for Media Manager SFTP or Editorial FTP accounts.
3. **Local-Only Non-Expanded Credentials (`src/lib/stockupload/credvault.ts`, `StockFtpCredentials.tsx`)**:
   - Extend `FtpCredentials` with optional `apiKey` and `apiSecret` stored strictly in IndexedDB `iconSplitter/secrets` (`stock-ftp-cred:getty-images`), never expanded into DOM inputs, never written to `localStorage`/`export.json`/logs, and scrubbed in both browser (`redactCredentials`) and bridge (`scrubSecrets`) plus `src/lib/log.ts`.
4. **Loopback ESP HTTPS Bridge (`tools/bridge/esp/`)**:
   - Zero-dependency Node `node:https` session driver (`openEspSession`) plugged into `/ftps/{test,upload,close}` and `/health` (`esp: { ready: true }`), handling OAuth2 token acquisition (`/oauth2/token`), TLS certificate pinning, single-batch creation/reuse per pooled upload session, contribution creation + binary `PUT` upload, and immediate `AbortSignal`/socket-close cancellation (`RULE 7`).
5. **Preflight Pairing Warnings & One-Click ESP CSV Export (`src/lib/stockupload/{plan,gettycsv}.ts`)**:
   - `buildStockUploadPlan` warns on `.svg`/`.zip`, `.eps` without matching `.jpg` (`raster` off or `.png` raster), `> 50 MB` files, and missing title/description or `> 50` keywords.
   - `buildGettyEspCsv` + `Download ESP CSV` (`data-testid="stock-getty-csv"`) exports RFC-4180 `getty-esp-metadata.csv` (`file name,created date,title,description,country,brief code,keywords`) for direct import into `https://esp.gettyimages.com` or DeepMeta.
